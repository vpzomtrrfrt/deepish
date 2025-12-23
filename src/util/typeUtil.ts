// https://github.com/microsoft/TypeScript/issues/13298#issuecomment-692864087
export type TupleUnion<U extends string, R extends string[] = []> = {
	[S in U]: Exclude<U, S> extends never ? [...R, S] : TupleUnion<Exclude<U, S>, [...R, S]>;
}[U] & string[];
