// Utilities to help with XEP-0163 (Personal Eventing Protocol)

import xml, { Element } from "@xmpp/xml";

import { Client } from "./client";

export interface PubsubItemInfo {
	id: string;
	element: Element;
}

export async function fetchPubsubItems(client: Client, node: string): Promise<{items: PubsubItemInfo[]}> {
	const result = await client.iqCaller.get(
		xml(
			"pubsub",
			{xmlns: "http://jabber.org/protocol/pubsub"},
			xml(
				"items",
				{node},
			),
		),
	);

	if(typeof result === "undefined") throw new Error("Missing result from pubsub fetch");

	const itemsElem = result.getChild("items");
	if(typeof itemsElem === "undefined") throw new Error("Missing result from pubsub fetch");

	const itemElems = itemsElem.getChildren("item");

	return {
		items: itemElems.map(itemElem => {
			const id = itemElem.getAttr("id");
			if(typeof id !== "string") throw new Error("Missing ID for pubsub item");

			return {
				id,
				element: itemElem,
			};
		}),
	};
}

// XEP-0060 has conflicting information about whether batch publishing is possible,
// so only publish one item at a time to be safe
export async function publishPubsubItem(client: Client, node: string, item: Element) {
	await client.iqCaller.set(
		xml(
			"pubsub",
			{xmlns: "http://jabber.org/protocol/pubsub"},
			xml(
				"publish",
				{node},
				item,
			),
		),
	);
}

export async function retractPubsubItem(client: Client, node: string, itemID: string, notify: boolean) {
	await client.iqCaller.set(
		xml(
			"pubsub",
			{xmlns: "http://jabber.org/protocol/pubsub"},
			xml(
				"retract",
				{node, notify},
				xml("item", {id: itemID}),
			),
		),
	);
}
