import { Types } from "mongoose";
import { BadRequestError } from "#/core/error.response.js";
import type { RuntimeValue } from "#/types/value.types.js";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const toPositiveInteger = (value: RuntimeValue): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const getPagination = (
  query: Record<string, RuntimeValue>,
  { limit: defaultLimit = DEFAULT_PAGE_LIMIT, page: defaultPage = 1, maxLimit = MAX_PAGE_LIMIT } = {},
) => {
  const limit = Math.min(toPositiveInteger(query.limit) ?? defaultLimit, maxLimit);
  const page = toPositiveInteger(query.page) ?? defaultPage;
  return { limit, page, skip: (page - 1) * limit };
};

/** Reads a single string query parameter, ignoring arrays/objects produced by qs. */
const getQueryString = (query: Record<string, RuntimeValue>, key: string): string | undefined => {
  const value = query[key];
  return typeof value === "string" ? value.trim() || undefined : undefined;
};

const getSelectData = (fields: string[] = []) => Object.fromEntries(fields.map((field) => [field, 1]));

const validateObjectId = (id: string, fieldName: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${fieldName}: ${id}`);
  }
  return new Types.ObjectId(id);
};

const sum = <T>(list: readonly T[], pick: (entry: T) => number) =>
  list.reduce((total, entry) => total + pick(entry), 0);

export { getPagination, getQueryString, getSelectData, validateObjectId, sum };
export * from "./validation.js";
export * from "./mongo.js";
