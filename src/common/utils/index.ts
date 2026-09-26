"use strict";

const getInfoData = <T extends object, K extends keyof T>({
  field,
  object,
}: {
  field: readonly K[];
  object: T;
}): Pick<T, K> =>
  field.reduce(
    (result, key) => {
      result[key] = object[key];
      return result;
    },
    {} as Pick<T, K>,
  );

const getSelectData = ({ select = [] }: { select?: string[] }) => Object.fromEntries(select.map((field) => [field, 1]));

const getPagination = (
  query: Record<string, unknown>,
  defaults: { limit?: number; page?: number; maxLimit?: number } = {},
) => {
  const maxLimit = defaults.maxLimit ?? 100;
  const requestedLimit = Number(query.limit);
  const requestedPage = Number(query.page);
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, maxLimit)
      : (defaults.limit ?? 20);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : (defaults.page ?? 1);

  return { limit, page, skip: (page - 1) * limit };
};

/**
 * Recursively updates a nested object by flattening its keys.
 * @param obj - The object to update.
 * @returns A new object with flattened keys.
 */
const updateNestedObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
      const nestedObject = updateNestedObject(obj[key] as Record<string, unknown>);
      Object.keys(nestedObject).forEach((nestedKey) => {
        result[`${key}.${nestedKey}`] = nestedObject[nestedKey];
      });
    } else {
      result[key] = obj[key];
    }
  });

  return result;
};

export { getInfoData, getPagination, getSelectData, updateNestedObject };
