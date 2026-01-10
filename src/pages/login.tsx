import * as xmppClient from "@xmpp/client";
import { xml } from "@xmpp/client";
import useLinkState from "linkstate/hook";
import { useContext } from "preact/hooks";
import { useLocation } from "wouter-preact";

import { useAppContext } from "..";
import Button from "../components/Button";
import Dialog, { DialogContext, DialogFooter, DialogLike } from "../components/Dialog";
import Field, { FieldLabel } from "../components/Field";
import FieldList from "../components/FieldList";
import Input from "../components/Input";
import { useConnectionContext } from "../util/connection";
import useSubmitting from "../util/useSubmitting";

export default function LoginPage() {
	const [, navigate] = useLocation();

	const appCtx = useAppContext();
	const conn = useConnectionContext();

	const [jid, linkJid] = useLinkState("");
	const [password, linkPassword] = useLinkState("");

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		const atIdx = jid.indexOf("@");
		if(atIdx < 0) throw new Error("Invalid JID");

		const domain = jid.substring(atIdx + 1);

		const userAgent = crypto.randomUUID();

		const client = xmppClient.client({
			service: domain,
			domain,
			username: jid.substring(0, atIdx),
			credentials: {
				username: jid.substring(0, atIdx),
				password,
			},
			...({
				userAgent: xml("user-agent", {id: userAgent}),
			}),
		});

		try {
			let gotToken = false;

			(client as unknown as {fast: {
				saveToken(t: unknown): Promise<void>;
			}}).fast.saveToken = async token => {
				gotToken = true;

				conn.saveToken.call(undefined, client.jid!, token, userAgent);
			};

			await client.start();

			if(gotToken) {
				navigate("~/");
			}
			else {
				appCtx.showDialog(<IncompatibleDialog />);
			}
		}
		finally {
			client.stop();
		}
	});

	console.log("what", jid);

	return <div
		style={{
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			height: "100%",
		}}
	>
		<DialogLike>
			<form onSubmit={submit}>
				<h1>Log In</h1>
				<FieldList>
					<Field>
						<FieldLabel>XMPP Address</FieldLabel>
						<Input type="text" value={jid} onChange={linkJid} />
					</Field>
					<Field>
						<FieldLabel>Password</FieldLabel>
						<Input type="password" value={password} onChange={linkPassword} />
					</Field>
				</FieldList>
				<DialogFooter>
					<Button tier="primary" type="submit" disabled={submitting}>Log In</Button>
				</DialogFooter>
			</form>
		</DialogLike>
	</div>;
}

function IncompatibleDialog() {
	const dialogCtx = useContext(DialogContext)!;

	return <Dialog>
		<div>
			Your server is not compatible with Deepish.
		</div>
		<DialogFooter>
			<Button tier="secondary" onClick={dialogCtx.close}>Close</Button>
		</DialogFooter>
	</Dialog>;
}
