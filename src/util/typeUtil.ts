// https://github.com/microsoft/TypeScript/issues/13298#issuecomment-692864087
export type TupleUnion<U extends string, R extends string[] = []> = {
	[S in U]: Exclude<U, S> extends never ? [...R, S] : TupleUnion<Exclude<U, S>, [...R, S]>;
}[U] & string[];

// https://stackoverflow.com/a/66011942/2533397
export type StringLiteral<T> = T extends string ? string extends T ? never : T : never;

// https://stackoverflow.com/a/57103940/2533397
export type DistributiveOmit<T, K extends keyof T> = T extends T ? Omit<T, K> : never;
