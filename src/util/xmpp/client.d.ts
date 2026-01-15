import { Client as ClientCore } from "@xmpp/client-core";
import { Options as ConnectionOptions } from "@xmpp/connection";
import { IQCallee } from "@xmpp/iq/callee.js";
import { IQCaller } from "@xmpp/iq/caller.js";
import { CredentialsFactory, CredentialsObj } from "@xmpp/sasl2";
import { Element } from "@xmpp/xml";
import SASLFactory from "saslmechanisms";

export interface Client extends ClientCore {
	iqCaller: IQCaller<Client>;
	iqCallee: IQCallee<Client>;
}

export interface Options extends ConnectionOptions {
	username?: string;
	credentials?: CredentialsObj | CredentialsFactory<Client>;
	mechanisms: ReadonlyArray<(factory: SASLFactory) => unknown>;
	userAgent: Element;
	resource: string;
}

export function client(options?: Options): Client;
