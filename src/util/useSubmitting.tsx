import { useSignal } from "@preact/signals";
import { useCallback } from "preact/hooks";
import useLatestCallback from "use-latest-callback";

export default function useSubmitting<P extends unknown[], O>(fn: (...args: P) => Promise<O>) {
	const submittingSig = useSignal(false);

	const submitInner = useLatestCallback(fn);

	const submit = useCallback(async (...args: P) => {
		submittingSig.value = true;

		try {
			await submitInner(...args);
		}
		catch(err) {
			alert(err);
		}
		finally {
			submittingSig.value = false;
		}
	}, [submitInner, submittingSig]);

	return [submittingSig, submit] as const;
}
