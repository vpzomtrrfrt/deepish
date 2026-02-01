import { batch, ReadonlySignal, Signal,signal } from "@preact/signals";
import { useLiveSignal } from "@preact/signals/utils";
import { JID } from "@xmpp/jid";
import { pushAtSortPosition } from "array-push-at-sort-position";
import { useEffect, useMemo } from "preact/hooks";

import { ConnectionContext, Message, MessageEditEvent, messageEditIsAllowed, MessageEvent, MessageReactionsChangeEvent, MessageRemovalEvent, messageRemovalIsAllowed, useConnectionContext } from "./connection";
import SignalMap from "./SignalMap";
import StanzaID, { StanzaIDType } from "./xmpp/StanzaID";

export type MessageContainer = {
	type: "room";
	jid: JID;
} | {
	type: "direct";
	jid: JID;
};

export function useCreateMessageCache(container: MessageContainer) {
	const connSig = useLiveSignal(useConnectionContext());

	const msgCache = useMemo(() => new MessageCache(container, connSig), [container, connSig]);

	useEffect(() => {
		return () => msgCache[Symbol.dispose]();
	}, [msgCache]);

	return msgCache;
}

export class MessageCache {
	private messages: Signal<Message[]> = signal([]);
	private messageMap = new SignalMap<string, Message>();

	private unresolvedFastens = new Map<
		string,
		Array<
			{type: "messageRemove"; event: MessageRemovalEvent} |
				{type: "messageEdit"; event: MessageEditEvent} |
				{type: "messageReactionsChange"; event: MessageReactionsChangeEvent}
		>
	>;

	public constructor(public readonly container: MessageContainer, private conn: ReadonlySignal<ConnectionContext>) {
		this.conn.value.addEventListener("message", this.onMessage);
		this.conn.value.addEventListener("messageRemove", this.onMessageRemove);
		this.conn.value.addEventListener("messageEdit", this.onMessageEdit);
		this.conn.value.addEventListener("messageReactionsChange", this.onMessageReactionsChange);
	}

	public [Symbol.dispose]() {
		this.conn.value.removeEventListener("message", this.onMessage);
		this.conn.value.removeEventListener("messageRemove", this.onMessageRemove);
		this.conn.value.removeEventListener("messageEdit", this.onMessageEdit);
		this.conn.value.removeEventListener("messageReactionsChange", this.onMessageReactionsChange);
	}

	public getMessages() {
		return this.messages.value;
	}

	public getMessage(id: StanzaID) {
		return this.messageMap.get(id.toString());
	}

	private onMessage = (evt: MessageEvent) => {
		if(this.container.type === "direct") {
			if(
				evt.message.room !== null || !(
					evt.message.from.bare().equals(this.container.jid) ||
						evt.message.to?.bare().equals(this.container.jid)
				)
			) {
				return;
			}
		}
		else if(this.container.type === "room") {
			if(evt.message.room === null || !evt.message.room.equals(this.container.jid)) return;
		}
		else {
			const _: never = this.container;
			return;
		}

		batch(() => {
			{
				let existing = undefined;
				for(const id of evt.message.ids) {
					existing = this.messageMap.get(id.toString());
					if(typeof existing !== "undefined") break;
				}

				if(typeof existing !== "undefined") {
					// Already present

					if(this.container.type === "direct") {
						// but we might need to add more IDs

						const newIDs = evt.message.ids.filter(newID => existing.ids.some(x => x.equals(newID)));
						if(newIDs.length > 0) {
							const newValue = {...existing, ids: [...existing.ids, ...newIDs]};
							this.messages.value = this.messages.value.map(x => {
								if(x === existing) return newValue;
								else return x;
							});

							newIDs.forEach(id => {
								this.messageMap.set(id.toString(), newValue);
							});
						}
					}

					return;
				}
			}

			let message = evt.message;
			evt.message.ids.forEach(id => {
				let list = this.unresolvedFastens.get(id.toString());

				if(id.type === StanzaIDType.Element) {
					const list2 = this.unresolvedFastens.get(new StanzaID(id.type, null, id.id).toString());
					if(typeof list2 !== "undefined") {
						if(typeof list === "undefined") list = list2;
						else list = [...list, ...list2];
					}
				}

				if(typeof list !== "undefined") {
					list.forEach(entry => {
						console.log("resolving unresolved fasten", id, entry.event.target, entry);
						if(entry.type === "messageRemove") {
							if(messageRemovalIsAllowed(evt.message, entry.event)) {
								message = {...message, removal: entry.event.removal};
							}
						}
						else if(entry.type === "messageEdit") {
							if(
								messageEditIsAllowed(evt.message, entry.event) && (
									message.editedAt === null ||
										message.editedAt.getTime() < entry.event.edit.timestamp.getTime()
								)
							) {
								message = {
									...message,
									content: entry.event.edit.content,
									editedAt: entry.event.edit.timestamp,
								};
							}
						}
						else if(entry.type === "messageReactionsChange") {
							const key = entry.event.from.jid.toString() + "/" + (
								typeof entry.event.from.occupantID === "undefined" ?
									"" :
									encodeURIComponent(entry.event.from.occupantID)
							);
							const reactionsEntry = message.reactions.get(key);

							if(
								typeof reactionsEntry === "undefined" ||
									reactionsEntry.timestamp.getTime() < entry.event.reactions.timestamp.getTime()
							) {
								const newReactions = new Map(message.reactions);
								newReactions.set(key, entry.event.reactions);

								message = {
									...message,
									reactions: newReactions,
								};
							}
						}
					});
					this.unresolvedFastens.delete(id.toString());
				}
			});

			evt.message.ids.forEach(id => {
				this.messageMap.set(id.toString(), message);
			});

			const newMessages = this.messages.value.slice();
			pushAtSortPosition(
				newMessages,
				message,
				(a, b) => (a.timestamp - b.timestamp) as (0 | 1 | -1), // it's not but should be fine
				0,
			);

			this.messages.value = newMessages;
		});
	};

	private onMessageRemove = (evt: MessageRemovalEvent) => {
		if(this.container.type === "direct") {
			if(evt.room !== null) {
				return;
			}
		}
		else if(this.container.type === "room") {
			if(evt.room === null || !evt.room.equals(this.container.jid)) return;
		}
		else {
			const _: never = this.container;
			return;
		}

		batch(() => {
			let anyHit = false;

			this.messages.value = this.messages.value.map(message => {
				if(message.ids.some(x => x.equals(evt.target))) {
					if(messageRemovalIsAllowed(message, evt)) {
						const newValue: Message = {
							...message,
							removal: evt.removal,
						};

						message.ids.forEach(id => {
							this.messageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(!anyHit) {
				console.log("got unresolved removal", evt);

				let list = this.unresolvedFastens.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					this.unresolvedFastens.set(evt.target.toString(), list);
				}
				list.push({type: "messageRemove", event: evt});
			}
		});
	};

	private onMessageEdit = (evt: MessageEditEvent) => {
		if(this.container.type === "direct") {
			if(evt.room !== null) {
				return;
			}
		}
		else if(this.container.type === "room") {
			if(evt.room === null || !evt.room.equals(this.container.jid)) return;
		}
		else {
			const _: never = this.container;
			return;
		}

		batch(() => {
			let anyHit = false;

			this.messages.value = this.messages.value.map(message => {
				if(message.ids.some(x => x.equals(evt.target))) {
					if(messageEditIsAllowed(message, evt) && (
						message.editedAt === null ||
							message.editedAt.getTime() < evt.edit.timestamp.getTime()
					)) {
						const newValue: Message = {
							...message,
							content: evt.edit.content,
							editedAt: evt.edit.timestamp,
						};

						message.ids.forEach(id => {
							this.messageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(!anyHit) {
				console.log("got unresolved edit", evt.target, evt);

				let list = this.unresolvedFastens.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					this.unresolvedFastens.set(evt.target.toString(), list);
				}
				list.push({type: "messageEdit", event: evt});
			}
		});
	};

	private onMessageReactionsChange = (evt: MessageReactionsChangeEvent) => {
		if(this.container.type === "direct") {
			if(evt.room !== null) {
				return;
			}
		}
		else if(this.container.type === "room") {
			if(evt.room === null || !evt.room.equals(this.container.jid)) return;
		}
		else {
			const _: never = this.container;
			return;
		}

		batch(() => {
			let anyHit = false;

			this.messages.value = this.messages.value.map(message => {
				if(message.ids.some(x => x.equals(evt.target, true))) {
					const key = evt.from.jid.bare().toString() + "/";
					const entry = message.reactions.get(key);

					if(typeof entry === "undefined" || entry.timestamp.getTime() < evt.reactions.timestamp.getTime()) {
						const newReactions = new Map(message.reactions);
						newReactions.set(key, evt.reactions);

						const newValue: Message = {
							...message,
							reactions: newReactions,
						};

						message.ids.forEach(id => {
							this.messageMap.set(id.toString(), newValue);
						});

						anyHit = true;

						return newValue;
					}
				}

				return message;
			});

			if(!anyHit) {
				console.log("got unresolved reactions change", evt);

				let list = this.unresolvedFastens.get(evt.target.toString());
				if(typeof list === "undefined") {
					list = [];
					this.unresolvedFastens.set(evt.target.toString(), list);
				}
				list.push({type: "messageReactionsChange", event: evt});
			}
		});
	};
}
