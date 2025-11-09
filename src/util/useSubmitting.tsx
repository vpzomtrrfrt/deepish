import { useCallback, useState } from "preact/hooks";

export default function useSubmitting<P extends unknown[], O>(fn: (...args: P) => Promise<O>, deps: unknown[]) {
	const [submitting, setSubmitting] = useState(false);

	const submitInner = useCallback(fn, deps);

	const submit = useCallback(async (...args: P) => {
		setSubmitting(true);

		try {
			submitInner(...args);
		}
		catch(err) {
			alert(err);
		}
		finally {
			setSubmitting(false);
		}
	}, [submitInner]);

	return [submitting, submit] as const;
}
