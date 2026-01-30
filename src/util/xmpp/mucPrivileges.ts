export enum MUCPrivilege {
	SendMessagesToAll,
	ModerateMessages,
}

export function checkPrivilegeForRole(privilege: MUCPrivilege, role: string): boolean {
	let level;
	if(role === "none") level = 0;
	else if(role === "visitor") level = 1;
	else if(role === "participant") level = 2;
	else if(role === "moderator") level = 3;
	else {
		console.warn("Unknown role:", role);
		level = 0;
	}

	if(privilege === MUCPrivilege.SendMessagesToAll) {
		return level >= 2;
	}
	else if(privilege === MUCPrivilege.ModerateMessages) {
		return level >= 3;
	}
	else {
		const _: never = privilege;
		console.warn("Unknown privilege:", privilege);
		return false;
	}
}
