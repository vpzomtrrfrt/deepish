import { ReadonlySignal, Signal, signal } from "@preact/signals";

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
		{
			const entry = this.store.get(key);
			if(typeof entry !== "undefined") {
				entry.value = value;
				return;
			}
		}
		{
			const entry = this.inactiveStore.get(key);
			if(typeof entry !== "undefined") {
				this.store.set(key, entry);
				this.inactiveStore.delete(key);
				entry.value = value;

				this.structureUpdatedSignal.value = Symbol();

				return;
			}
		}

		this.store.set(key, signal(value));
		this.structureUpdatedSignal.value = Symbol();
	}

	public delete(key: K) {
		const entry = this.store.get(key);
		if(typeof entry !== "undefined") {
			this.store.delete(key);
			this.inactiveStore.set(key, entry);
			this.structureUpdatedSignal.value = Symbol();

			entry.value = undefined;
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
}
