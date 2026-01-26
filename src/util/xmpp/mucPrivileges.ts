export enum MUCPrivilege {
	SendMessagesToAll,
}

export function checkPrivilegeForRole(privilege: MUCPrivilege, role: string) {
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
}
