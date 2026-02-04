import { css, cx } from "@emotion/css";
import { mdiCheck, mdiClose } from "@mdi/js";
import { useComputed, useSignal } from "@preact/signals";
import { JID, parse as parseJID } from "@xmpp/jid";
import useLinkState from "linkstate/hook";
import { useCallback } from "preact/hooks";
import { useIntl } from "react-intl";
import useLatestCallback from "use-latest-callback";
import { Link } from "wouter-preact";

import { useAppContext } from "../..";
import AvatarWithStatus from "../../components/AvatarWithStatus";
import Block from "../../components/Block";
import Button from "../../components/Button";
import ConfirmDialog from "../../components/ConfirmDialog";
import { getCounterpartStatusContent } from "../../components/CounterpartStatusContent";
import For from "../../components/For";
import Icon from "../../components/Icon";
import IconButton from "../../components/IconButton";
import Input from "../../components/Input";
import Menu, { MenuItem } from "../../components/Menu";
import PriorityUnreadIndicator from "../../components/PriorityUnreadIndicator";
import { ManualTabsContainer, TabLink, TabsList } from "../../components/Tabs";
import WithTooltip from "../../components/WithTooltip";
import * as commonStyles from "../../util/commonStyles";
import { useAccountSig, useConnectionContext } from "../../util/connection";
import { msgActionAdd } from "../../util/langCommon";
import { getNickForCounterpart } from "../../util/profileUtil";
import { useSignalMapKeysWhereValueMatches } from "../../util/SignalMap";
import { Counterpart } from "../../util/types";
import useSubmitting from "../../util/useSubmitting";

const styles = {
	contactsPage: css({
		display: "flex",
		flexDirection: "column",
		flexGrow: 1,
	}),
	friendEntry: cx(commonStyles.hoverOverlay, css({
		display: "flex",
		gap: ".5rem",
		alignItems: "center",

		padding: ".5rem",

		textDecoration: "none",
		color: "inherit",

		".friendEntryJID": {
			visibility: "hidden",
		},

		"&:hover": {
			".friendEntryJID": {
				visibility: "visible",
			},
		},
	})),
	friendButtons: css({
		display: "flex",
		gap: ".5rem",
		flexShrink: 0,
		pointerEvents: "none",

		"> *": {
			pointerEvents: "auto",
		}
	}),
	friendEntryNameRow: css({
		display: "flex",
		alignItems: "center",
		gap: ".5rem",
	}),
	friendEntryJID: cx("friendEntryJID", css({
		display: "inline-block",
		fontSize: "80%",
		overflowX: "hidden",
		textOverflow: "ellipsis",
	})),
	statusText: cx("statusText", css({
		opacity: 0.65,
		fontSize: "80%",

		whiteSpace: "nowrap",
		overflowX: "hidden",
		textOverflow: "ellipsis",
	})),
};

enum FriendsTab {
	Online,
	All,
	Requests,
}

export default function ContactsPage() {
	const { $t } = useIntl();

	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const tabSig = useSignal<FriendsTab>(FriendsTab.All);
	const setTab = useCallback((newTab: FriendsTab) => {
		tabSig.value = newTab;
	}, [tabSig]);

	function acceptFriendRequest(target: JID) {
		conn.acceptFriendRequest(accountSig.value.jid, target);
	}

	function rejectFriendRequest(target: JID) {
		conn.rejectFriendRequest(accountSig.value.jid, target);
	}

	function removeFriend(target: JID) {
		conn.removeFriend(accountSig.value.jid, target);
	}

	const incomingRequestCounterpartsSig = useComputed(() => {
		return Array.from(accountSig.value.counterparts.values())
			.filter(counterpartIsIncomingRequest);
	});
	const incomingRequestCounterpartsCount = useComputed(() => incomingRequestCounterpartsSig.value.length).value;

	const outgoingRequestCounterpartsSig = useComputed(() => {
		return Array.from(accountSig.value.counterparts.values())
			.filter(info => {
				return info.rosterEntry !== null &&
					!info.rosterEntry.subscriptionTo &&
					info.rosterEntry.requestingSubscriptionTo;
			});
	});
	const outgoingRequestCounterpartsCount = useComputed(() => outgoingRequestCounterpartsSig.value.length).value;

	const friendsSig = useSignalMapKeysWhereValueMatches(accountSig.value.counterparts, info => {
		if(info.rosterEntry === null) return false;
		if(!info.rosterEntry.subscriptionTo) return false;

		return true;
	}, true);

	const visibleFriendsSig = useComputed(() => {
		if(tabSig.value === FriendsTab.All) return friendsSig.value;
		else if(tabSig.value === FriendsTab.Online) {
			return friendsSig.value.filter(key => {
				const info = accountSig.value.counterparts.get(key)!;
				return info.presences !== null && info.presences.size > 0;
			});
		}
		else return [];
	});

	return <div class={styles.contactsPage}>
		<ManualTabsContainer tab={tabSig.value} setTab={setTab}>
			<TabsList>
				<TabLink tab={FriendsTab.Online}>
					{$t({defaultMessage: "Online", description: "Friends tab"})}
				</TabLink>
				<TabLink tab={FriendsTab.All}>
					{$t({defaultMessage: "All"})}
				</TabLink>
				<TabLink tab={FriendsTab.Requests}>
					{$t({defaultMessage: "Requests"})}
					{incomingRequestCounterpartsCount > 0 &&
						<>
							{" "}
							<PriorityUnreadIndicator count={incomingRequestCounterpartsCount} />
						</>
					}
				</TabLink>
			</TabsList>

			<div style={{overflowY: "auto"}}>
				{
					(tabSig.value === FriendsTab.All || tabSig.value === FriendsTab.Online) && <div>
						<For each={visibleFriendsSig} static>
							{item => <FriendEntry jid={item} />}
						</For>
					</div>
				}
				{
					tabSig.value === FriendsTab.Requests && <div>
						<Block>
							<h1>{$t({defaultMessage: "Add Friend"})}</h1>
							<AddFriendForm />
						</Block>
						{outgoingRequestCounterpartsCount > 0 &&
							<Block>
								<h1>
									{$t({defaultMessage: "Outgoing", description: "Heading for outgoing friend requests"})}
								</h1>
								<div>
									<For each={outgoingRequestCounterpartsSig}>
										{info => {
											return <div class={styles.friendEntry} key={info.jid.toString()}>
												<div style={{flexGrow: 1}}>
													{info.jid.toString()}
												</div>
												<div class={styles.friendButtons}>
													<WithTooltip tooltip={$t({defaultMessage: "Cancel Request"})}>
														<IconButton onClick={removeFriend.bind(undefined, info.jid)}>
															<Icon path={mdiClose} />
														</IconButton>
													</WithTooltip>
												</div>
											</div>;
										}}
									</For>
								</div>
							</Block>
						}
						{
							incomingRequestCounterpartsCount > 0 &&
								<Block>
									<h1>
										{$t({
											defaultMessage: "Incoming",
											description: "Heading for incoming friend requests",
										})}
									</h1>
									<div>
										<For each={incomingRequestCounterpartsSig}>
											{info => {
												return <div class={styles.friendEntry} key={info.jid.toString()}>
													<div style={{flexGrow: 1}}>
														{info.jid.toString()}
													</div>
													<div class={styles.friendButtons}>
														<WithTooltip tooltip={$t({defaultMessage: "Accept Request"})}>
															<IconButton onClick={acceptFriendRequest.bind(undefined, info.jid)}>
																<Icon path={mdiCheck} />
															</IconButton>
														</WithTooltip>
														<WithTooltip tooltip={$t({defaultMessage: "Reject Request"})}>
															<IconButton onClick={rejectFriendRequest.bind(undefined, info.jid)}>
																<Icon path={mdiClose} />
															</IconButton>
														</WithTooltip>
													</div>
												</div>;
											}}
										</For>
									</div>
								</Block>
						}
					</div>
				}
			</div>
		</ManualTabsContainer>
	</div>;
}

function FriendEntry(props: {jid: string}) {
	const intl = useIntl();
	const { $t } = intl;

	const appCtx = useAppContext();
	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const info = useComputed(() => accountSig.value.counterparts.get(props.jid)).value!;

	const onClickFriendButtons = useCallback((evt: Event) => {
		evt.stopPropagation();
		evt.preventDefault();
	}, []);

	function removeFriend(target: JID) {
		conn.removeFriend(accountSig.value.jid, target);
	}

	const removeFriendAfterConfirm = useLatestCallback((target: JID) => {
		appCtx.showDialog(
			<ConfirmDialog
				onConfirm={removeFriend.bind(undefined, target)}
				confirmText={$t({defaultMessage: "Remove Friend"})}
			>
				<p>
					{$t({
						defaultMessage: "Are you sure you want to remove {target} as a friend?"
					}, {target: <em>{target.toString()}</em>})}
				</p>
			</ConfirmDialog>,
		);
	});

	const statusContent = getCounterpartStatusContent(info, intl);

	return <Link
		to={"~/chat/direct/" + encodeURIComponent(info.jid.toString())}
		key={info.jid.toString()}
		class={styles.friendEntry}
	>
		<AvatarWithStatus size="md" jid={info.jid} />
		<div style={{flexGrow: 1}}>
			<div class={styles.friendEntryNameRow}>
				{getNickForCounterpart(info)}
				<span class={styles.friendEntryJID}>{info.jid.toString()}</span>
			</div>
			{statusContent !== null && <div class={styles.statusText}>
				{statusContent}
			</div>}
		</div>
		<div class={styles.friendButtons} onClick={onClickFriendButtons}>
			<Menu>
				<MenuItem onClick={removeFriendAfterConfirm.bind(undefined, info.jid)}>
					{$t({defaultMessage: "Remove Friend"})}
				</MenuItem>
			</Menu>
		</div>
	</Link>;
}

function AddFriendForm() {
	const { $t } = useIntl();

	const conn = useConnectionContext();
	const accountSig = useAccountSig();

	const [input, linkInput, setInput] = useLinkState("");

	const [submitting, submit] = useSubmitting((evt: Event) => {
		evt.preventDefault();

		conn.sendFriendRequest(accountSig.value.jid, parseJID(input));

		setInput("");

		return Promise.resolve();
	});

	return <form onSubmit={submit}>
		<Input type="text" value={input} onChange={linkInput} placeholder="user@server.example" pattern=".*@.*" />
		{" "}
		<Button tier="primary" type="submit" disabled={submitting}>{$t(msgActionAdd)}</Button>
	</form>
}

function counterpartIsIncomingRequest(info: Counterpart) {
	return info.requestingMySubscription;
}
