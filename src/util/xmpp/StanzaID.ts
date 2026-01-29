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
	public constructor(public readonly type: StanzaIDType, public readonly by: JID | null, public readonly id: string) {
	}

	public toString() {
		return this.type +
			"/" +
			(this.by === null ? "" : encodeURIComponent(this.by.toString())) +
			"/" +
			encodeURIComponent(this.id);
	}

	public equals(other: StanzaID, ignoreElementBy: boolean = false) {
		if(this.type === other.type && this.id === other.id) {
			if(ignoreElementBy && this.type === StanzaIDType.Element) return true;
			else return (this.by === null ? other.by === null : (other.by !== null && this.by.equals(other.by)));
		}
		else return false;
	}
}
