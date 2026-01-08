import * as xmppClient from "@xmpp/client";
import { xml } from "@xmpp/client";
import useLinkState from "linkstate/hook";
import { useLocation } from "wouter-preact";

import { useConnectionContext } from "../util/connection";
import useSubmitting from "../util/useSubmitting";

export default function LoginPage() {
	const [, navigate] = useLocation();

	const conn = useConnectionContext();

	const [jid, linkJid] = useLinkState("");
	const [password, linkPassword] = useLinkState("");

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		const atIdx = jid.indexOf("@");
		if(atIdx < 0) throw new Error("Invalid JID");

		const authCallback = Promise.withResolvers<void>();

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
			(client as unknown as {fast: {
				saveToken(t: unknown): Promise<void>;
			}}).fast.saveToken = async token => {
				conn.saveToken.call(undefined, client.jid!, token, userAgent);

				authCallback.resolve();
			};

			await client.start();

			await authCallback.promise;

			console.log("connected");

			navigate("~/");
		}
		finally {
			client.stop();
		}
	});

	console.log("what", jid);

	return <div>
		<form onSubmit={submit}>
			<input type="text" value={jid} onChange={linkJid} />
			<input type="password" value={password} onChange={linkPassword} />
			<button type="submit" disabled={submitting}>Continue</button>
		</form>
	</div>;
}
