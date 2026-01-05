import { useCallback, useState } from "preact/hooks";
import useLatestCallback from "use-latest-callback";

export default function useSubmitting<P extends unknown[], O>(fn: (...args: P) => Promise<O>) {
	const [submitting, setSubmitting] = useState(false);

	const submitInner = useLatestCallback(fn);

	const submit = useCallback(async (...args: P) => {
		setSubmitting(true);

		try {
			await submitInner(...args);
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
