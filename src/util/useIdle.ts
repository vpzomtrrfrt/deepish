import { createModel, effect, signal, useModel } from "@preact/signals";

export interface IdleState {
	idle: boolean;
	since: Date;
}

const TIMEOUT = 1000 * 60;
const EVENTS = ["mousemove", "keydown"];

const IdleModel = createModel(() => {
	const initTime = new Date();

	const stateSig = signal<IdleState>({idle: false, since: initTime});

	let lastActivity = initTime.getTime();
	let timer: ReturnType<typeof setTimeout> | null = null;

	function onIdle() {
		stateSig.value = {idle: true, since: new Date(lastActivity)};
	}

	function onAnything() {
		if(stateSig.peek().idle) {
			const newTime = new Date();

			stateSig.value = {idle: false, since: newTime};
			lastActivity = newTime.getTime();
		}
		else {
			lastActivity = Date.now();
			if(timer !== null) clearTimeout(timer);
		}

		timer = setTimeout(onIdle, TIMEOUT);
	}

	effect(() => {
		EVENTS.forEach(type => {
			window.addEventListener(type, onAnything);
		});

		onAnything();

		return () => {
			EVENTS.forEach(type => {
				window.removeEventListener(type, onAnything);
			});
		};
	});

	return {
		state: stateSig,
	};
});

export default function useIdle() {
	return useModel(IdleModel);
}
