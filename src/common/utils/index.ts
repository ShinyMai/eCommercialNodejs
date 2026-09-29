import { BadRequestError } from "#/core/error.response.js";
import { Types } from "mongoose";
import type { RuntimeValue } from "#/types/value.types.js";
("use strict");

const getSelectData = ({ select = [] }: { select?: string[] }) => Object.fromEntries(select.map((field) => [field, 1]));

const getPagination = (
  query: Record<string, RuntimeValue>,
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

const validateObjectId = (id: string, fieldName: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${fieldName}: ${id}`);
  }

  return new Types.ObjectId(id);
};

export { getPagination, getSelectData, validateObjectId };
