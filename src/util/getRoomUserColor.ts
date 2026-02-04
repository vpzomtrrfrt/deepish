import { Counterpart } from "./types";

export default function getRoomUserColor(counterpart: Counterpart) {
	// TODO Adjust brightness based on theme

	if(counterpart.affiliation === "owner") return "#F44336";
	else if(counterpart.affiliation === "admin") return "#4CAF50";
	else return null;
}
