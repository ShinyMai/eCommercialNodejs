import type { ClientSession } from "mongoose";

type TransactionOptions = NonNullable<Parameters<ClientSession["withTransaction"]>[1]>;

/** Transaction settings shared by every multi-document write. */
export const TRANSACTION_OPTIONS: TransactionOptions = {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" },
};

export const isDuplicateKeyError = (error: unknown): boolean =>
  error instanceof Error && (error as Error & { code?: number }).code === 11_000;

/** Attaches the session only when one is provided, so the same query works inside and outside transactions. */
export const withSession = <TQuery extends { session(session: ClientSession): unknown }>(
  query: TQuery,
  session?: ClientSession,
): TQuery => {
  if (session) query.session(session);
  return query;
};
