import { JID } from "@xmpp/jid";

export enum StanzaIDType {
	/// The ID attribute on the stanza
	Element,

	/// <origin-id> from XEP-0359
	Origin,

	/// <stanza-id> from XEP-0359
	Stanza,
}

export default class StanzaID {
	public constructor(public readonly type: StanzaIDType, public readonly by: JID, public readonly id: string) {
	}

	public toString() {
		return this.type + "/" + encodeURIComponent(this.by.toString()) + "/" + encodeURIComponent(this.id);
	}

	public equals(other: StanzaID) {
		return this.type === other.type && this.id === other.id && this.by.equals(other.by);
	}
}
