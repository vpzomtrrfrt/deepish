import * as xmppClient from "@xmpp/client";
import { xml } from "@xmpp/client";
import useLinkState from "linkstate/hook";
import { useCallback, useState } from "preact/hooks";
import useSubmitting from "../util/useSubmitting";
import { useAppContext } from "..";

export default function LoginPage() {
	const appCtx = useAppContext();

	const [client, setClient] = useState<null | xmppClient.Client>(null);

	const [jid, linkJid] = useLinkState("");
	const [password, linkPassword] = useLinkState("");

	const [submitting, submit] = useSubmitting(async (evt: Event) => {
		evt.preventDefault();

		const atIdx = jid.indexOf("@");
		if(atIdx < 0) throw new Error("Invalid JID");

		const initPromise = Promise.withResolvers();
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

		(client as unknown as {fast: {
			saveToken(t: unknown): Promise<void>;
		}}).fast.saveToken = async token => {
			appCtx.saveToken.call(undefined, client.jid!, token, userAgent);
		};

		await client.start();

		console.log("connected");
	});

	console.log("what", jid);

	return <div>
		{
			client === null ?
				<form onSubmit={submit}>
					<input type="text" value={jid} onChange={linkJid} />
					<input type="password" value={password} onChange={linkPassword} />
					<button type="submit" disabled={submitting}>Continue</button>
				</form> :
				null
		}
	</div>;
}
