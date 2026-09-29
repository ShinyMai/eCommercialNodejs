export type ScalarValue = string | number | boolean | bigint | symbol | null | undefined;

export type RuntimeValue = ScalarValue | object;

export type RuntimeRecord = Record<string, RuntimeValue>;
