import xid from "@xmpp/id";
import { jid } from "@xmpp/jid";
import xml from "@xmpp/xml";
import { expect, test } from "vitest";

import type { ConnectionContext, ConnectionEventMap, Message } from "./connection";
import { MessageCache } from "./messageCache";
import StanzaID, { StanzaIDType } from "./xmpp/StanzaID";

const TEST_MESSAGE_BASE = {
	removal: null,
	editedAt: null,
	reactions: new Map(),
	raw: xml("message"),
	replyingTo: null,
} satisfies Partial<Message>;

const ME = jid("test2@server.example");
const OTHER_USER = jid("test2@server.example");

function basicDirectMessage(src: Omit<Message, "ids" | "occupantID" | "room" | "localID" | "timestamp" | keyof typeof TEST_MESSAGE_BASE>): Message {
	const id = xid();

	return {
		...TEST_MESSAGE_BASE,
		room: null,
		occupantID: null,
		localID: id,
		ids: [new StanzaID(StanzaIDType.Element, OTHER_USER, id)],
		timestamp: new Date(),
		...src,
	};
}

class MockConnectionContext implements Pick<ConnectionContext, "addEventListener" | "removeEventListener" | "requestArchive" | "jid"> {
	private listeners: Partial<{
		[K in keyof ConnectionEventMap]: Set<(evt: ConnectionEventMap[K]) => void>
	}> = {};

	public jid = ME;

	public addEventListener<K extends keyof ConnectionEventMap>(event: K, listener: (evt: ConnectionEventMap[K]) => void) {
		if(!(event in this.listeners)) this.listeners[event] = new Set<never>();
		this.listeners[event]!.add(listener);
	}

	public removeEventListener<K extends keyof ConnectionEventMap>(event: K, listener: (evt: ConnectionEventMap[K]) => void) {
		this.listeners[event]!.delete(listener);
	}
	
	public async requestArchive(): Promise<never> {
		throw new Error("Attempted to request archive from MockConnectionContext");
	}

	public emit<K extends keyof ConnectionEventMap>(eventType: K, event: ConnectionEventMap[K]) {
		this.listeners[eventType]?.forEach(listener => {
			try {
				listener(event);
			}
			catch(ex) {
				console.error(ex);
			}
		});
	}
}

test("should accept a new message", () => {
	const msg = basicDirectMessage({
		from: OTHER_USER,
		to: ME,
		content: [],
	});

	const conn = new MockConnectionContext();

	using cache = new MessageCache(
		{type: "direct", jid: OTHER_USER},
		conn,
	);

	expect(cache.getMessages()).toHaveLength(0);

	conn.emit("message", {
		account: ME,
		message: msg,
		isNew: true,
		shouldNotify: true,
	});

	const got = cache.getMessages();
	expect(got).toHaveLength(1);
	expect(got[0].localID).toEqual(msg.localID);

	expect(cache.getMessage(msg.ids[0])).toBeDefined();
});

test("should increment appendedCount when adding a message", () => {
	const msg = basicDirectMessage({
		from: OTHER_USER,
		to: ME,
		content: [],
	});

	const conn = new MockConnectionContext();

	using cache = new MessageCache(
		{type: "direct", jid: OTHER_USER},
		conn,
	);

	expect(cache.getAppendedCount()).toEqual(0);

	conn.emit("message", {
		account: ME,
		message: msg,
		isNew: true,
		shouldNotify: true,
	});

	expect(cache.getAppendedCount()).toEqual(1);
});
