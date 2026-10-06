import { Types } from "mongoose";

/** A fresh 24-char hex ObjectId string. */
export const newId = () => new Types.ObjectId().toHexString();

/**
 * Minimal stand-in for a Mongoose query: every chain method returns itself and
 * `exec()` / `await` resolve to the value produced by `resolve`.
 */
export const fakeQuery = <T>(resolve: () => T | Promise<T>, { onSession }: { onSession?: (session: unknown) => void } = {}) => {
  const query = {
    select: () => query,
    lean: () => query,
    limit: () => query,
    skip: () => query,
    sort: () => query,
    populate: () => query,
    session: (session: unknown) => {
      onSession?.(session);
      return query;
    },
    exec: async () => resolve(),
    then: <R1 = T, R2 = never>(
      onFulfilled?: (value: T) => R1 | PromiseLike<R1>,
      onRejected?: (reason: unknown) => R2 | PromiseLike<R2>,
    ) => Promise.resolve().then(resolve).then(onFulfilled, onRejected),
  };
  return query;
};

/** Shorthand for a query that resolves to a fixed value. */
export const queryOf = <T>(value: T) => fakeQuery(() => value);

/** Captures what a controller sends without an HTTP server. */
export const fakeResponse = () => {
  const sent: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.statusCode = code;
      return res;
    },
    json(body: unknown) {
      sent.body = body;
      return res;
    },
  };
  return { res, sent };
};
