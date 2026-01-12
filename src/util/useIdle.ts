import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import useLatestCallback from "use-latest-callback";

export interface IdleState {
	idle: boolean;
	since: Date;
}

const TIMEOUT = 1000 * 60;
const EVENTS = ["mousemove", "keydown"];

export default function useIdle(): IdleState {
	const initTime = useMemo(() => new Date(), []);

	const [state, setState] = useState({idle: false, since: initTime});

	const lastActivityRef = useRef(initTime.getTime());
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const onIdle = useCallback(() => {
		setState({idle: true, since: new Date(lastActivityRef.current)});
	}, []);

	const onAnything = useLatestCallback(() => {
		if(state.idle) {
			const newTime = new Date();

			setState({idle: false, since: newTime});
			lastActivityRef.current = newTime.getTime();
		}
		else {
			lastActivityRef.current = Date.now();
			if(timerRef.current !== null) clearTimeout(timerRef.current);
		}

		timerRef.current = setTimeout(onIdle, TIMEOUT);
	});

	useEffect(() => {
		EVENTS.forEach(type => {
			window.addEventListener(type, onAnything);
		});

		onAnything();

		return () => {
			EVENTS.forEach(type => {
				window.removeEventListener(type, onAnything);
			});
		};
	}, [onAnything]);

	return state;
}
