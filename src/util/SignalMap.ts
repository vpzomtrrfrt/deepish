import { batch, ReadonlySignal, Signal, signal, untracked, useComputed } from "@preact/signals";
import { useCallback, useEffect, useMemo } from "preact/hooks";

export default class SignalMap<K, V> {
	/**
		* Storage for the current entries in the map
	*/
	private store = new Map<K, Signal<V | undefined>>();

	/**
		* Storage for entries that *aren't* in the map, but have been requested at some point.
		* Those subscribers need to know when the value starts existing.
	*/
	private inactiveStore = new Map<K, Signal<V | undefined>>();

	private structureUpdatedSignal = signal<unknown>(Symbol());

	private changeListeners = new Set<(evt: SignalMapChangeEvent<K, V>) => void>();

	public get(key: K): V | undefined {
		return this.getSignal(key).value;
	}

	public getSignal(key: K): ReadonlySignal<V | undefined> {
		{
			const entry = this.store.get(key);
			if(typeof entry !== "undefined") return entry;
		}
		{
			const entry = this.inactiveStore.get(key);
			if(typeof entry !== "undefined") return entry;
		}
		{
			const entry = signal<V | undefined>(undefined);
			this.inactiveStore.set(key, entry);
			return entry;
		}
	}

	public has(key: K) {
		return typeof this.get(key) !== "undefined";
	}

	public set(key: K, value: V) {
		batch(() => {
			let done = false;

			{
				const entry = this.store.get(key);
				if(typeof entry !== "undefined") {
					entry.value = value;
					done = true;
				}
			}

			if(!done) {
				const entry = this.inactiveStore.get(key);
				if(typeof entry !== "undefined") {
					this.store.set(key, entry);
					this.inactiveStore.delete(key);
					entry.value = value;

					this.structureUpdatedSignal.value = Symbol();

					done = true;
				}
			}

			if(!done) {
				this.store.set(key, signal(value));
				this.structureUpdatedSignal.value = Symbol();
			}

			const evt: SignalMapChangeEvent<K, V> = {
				changeType: "set",
				key,
				value,
			};

			this.changeListeners.forEach(fn => {
				try {
					fn(evt);
				}
				catch(ex) {
					console.error(ex);
				}
			});
		});
	}

	public delete(key: K) {
		const entry = this.store.get(key);
		if(typeof entry !== "undefined") {
			batch(() => {
				this.store.delete(key);
				this.inactiveStore.set(key, entry);
				this.structureUpdatedSignal.value = Symbol();

				entry.value = undefined;

				const evt: SignalMapChangeEvent<K, V> = {
					changeType: "delete",
					key,
				};

				this.changeListeners.forEach(fn => {
					try {
						fn(evt);
					}
					catch(ex) {
						console.error(ex);
					}
				});
			});
		}
	}

	public* entries(): Generator<[K, V]> {
		const _ = this.structureUpdatedSignal.value;

		for(const [key, entry] of this.store) {
			const value = entry.value;
			if(typeof value === "undefined") {
				throw new Error("Map entry has no value");
			}

			yield [key, value];
		}
	}

	public keys() {
		return this.entries().map(([key]) => key);
	}

	public values() {
		return this.entries().map(([, value]) => value);
	}

	public addEventListener(type: "change", fn: (evt: SignalMapChangeEvent<K, V>) => void) {
		this.changeListeners.add(fn);
	}

	public removeEventListener(type: "change", fn: (evt: SignalMapChangeEvent<K, V>) => void) {
		this.changeListeners.delete(fn);
	}
}

export type SignalMapChangeEvent<K, V> = {
	changeType: "set";
	key: K;
	value: V;
} | {
	changeType: "delete";
	key: K;
};

export function useSignalMapKeysWhereValueMatches<K, V>(
	map: SignalMap<K, V>,
	predicate: (value: V, key: K) => boolean,
) {
	// I expect all these dep lists to actually always trigger together

	const [dest, kill] = useMemo(() => {
		const result = new Set<K>();

		untracked(() => {
			for(const [key, value] of map.entries()) {
				if(predicate(value, key)) result.add(key);
			}
		});

		return [signal(result), signal(false)];
	}, [map, predicate]);

	const onChange = useCallback((evt: SignalMapChangeEvent<K, V>) => {
		untracked(() => {
			const currentSet = dest.value;
			if(evt.changeType === "set") {
				if(predicate(evt.value, evt.key)) {
					if(!currentSet.has(evt.key)) {
						const newSet = new Set(currentSet);
						newSet.add(evt.key);
						dest.value = newSet;
					}
				}
				else {
					if(currentSet.has(evt.key)) {
						const newSet = new Set(currentSet);
						newSet.delete(evt.key);
						dest.value = newSet;
					}
				}
			}
		});
	}, [dest, predicate]);

	useMemo(() => {
		map.addEventListener("change", onChange);
	}, [onChange, map]);

	useEffect(() => {
		return () => {
			kill.value = true;
			map.removeEventListener("change", onChange);
		};
	}, [kill, map, onChange]);

	return useComputed(() => {
		if(kill.value) throw new Error("This signal is no longer available");
		return Array.from(dest.value);
	});
}
