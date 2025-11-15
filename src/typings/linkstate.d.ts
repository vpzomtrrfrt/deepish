declare module "linkstate/hook" {
	export default function useLinkState<S>(
		initialState: S,
		eventPath?: string
	): [S, (e: Event) => void, (value: S | ((prevState: S) => S)) => void];
}
