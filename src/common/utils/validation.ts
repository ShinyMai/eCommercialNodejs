import { BadRequestError } from "#/core/error.response.js";

export const validateIdString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{24}$/.test(value)) {
    throw new BadRequestError(`${field} must be a valid 24-character ID string`);
  }
  return value.toLowerCase();
};

export const validateRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError(`Invalid ${field}`);
  }
  return value as Record<string, unknown>;
};

export const validateNonEmptyArray = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value) || !value.length) throw new BadRequestError(`Invalid ${field}`);
  return value;
};

export const validatePositiveSafeInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new BadRequestError(`${field} must be a positive safe integer`);
  }
  return value;
};

export const validateUniqueValue = <T>(value: T, seen: Set<T>, field: string): T => {
  if (seen.has(value)) throw new BadRequestError(`Duplicate ${field}`);
  seen.add(value);
  return value;
};
