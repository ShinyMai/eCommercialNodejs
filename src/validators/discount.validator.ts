import { BadRequestError } from "#/core/error.response.js";
import {
  DISCOUNT_APPLIES_TO,
  DISCOUNT_TYPES,
  type DiscountAppliesTo,
  type DiscountType,
} from "#/models/discount.model.js";
import { validateObjectId } from "#/utils/index.js";

export interface DiscountInput {
  discount_name: string;
  discount_description: string;
  discount_type: DiscountType;
  discount_value: number;
  discount_code: string;
  discount_start_date: Date | string;
  discount_end_date: Date | string;
  discount_max_uses: number;
  discount_minimum_purchase: number;
  discount_applies_to: DiscountAppliesTo;
  discount_productIds: string[];
}

export interface DiscountCartItemInput {
  productId: string;
  quantity: number;
}

export interface CalculateDiscountInput {
  products: DiscountCartItemInput[];
  sellerId: string;
}

const DISCOUNT_FIELDS: readonly (keyof DiscountInput)[] = [
  "discount_name",
  "discount_description",
  "discount_type",
  "discount_value",
  "discount_code",
  "discount_start_date",
  "discount_end_date",
  "discount_max_uses",
  "discount_minimum_purchase",
  "discount_applies_to",
  "discount_productIds",
];
const OPTIONAL_FIELDS = new Set<keyof DiscountInput>(["discount_productIds"]);
const TEXT_FIELDS = ["discount_name", "discount_description", "discount_code"] as const;
const AMOUNT_FIELDS = ["discount_value", "discount_minimum_purchase"] as const;

const isNonNegativeNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

const pickDiscountFields = (source: Partial<DiscountInput>): Partial<DiscountInput> =>
  Object.fromEntries(DISCOUNT_FIELDS.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]));

/** Validates field types. Cross-field rules that need the stored discount live in `validateDiscountRules`. */
export const parseDiscountInput = (
  value: DiscountInput | Partial<DiscountInput>,
  partial: boolean,
): Partial<DiscountInput> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError("Discount payload must be an object");
  }
  const result = pickDiscountFields(value);

  if (!partial) {
    if (DISCOUNT_FIELDS.some((field) => !OPTIONAL_FIELDS.has(field) && result[field] === undefined)) {
      throw new BadRequestError("Missing required discount fields");
    }
    result.discount_productIds ??= [];
  } else if (!Object.keys(result).length) {
    throw new BadRequestError("No supported discount fields to update");
  }

  for (const field of TEXT_FIELDS) {
    const text = result[field];
    if (text === undefined) continue;
    if (typeof text !== "string" || !text.trim()) throw new BadRequestError(`${field} must be a non-empty string`);
    result[field] = text.trim();
  }
  result.discount_code &&= result.discount_code.toUpperCase();

  if (result.discount_type !== undefined && !DISCOUNT_TYPES.includes(result.discount_type)) {
    throw new BadRequestError("discount_type must be percentage or fixed_amount");
  }
  if (result.discount_applies_to !== undefined && !DISCOUNT_APPLIES_TO.includes(result.discount_applies_to)) {
    throw new BadRequestError("discount_applies_to must be all or specific_products");
  }
  for (const field of AMOUNT_FIELDS) {
    if (result[field] !== undefined && !isNonNegativeNumber(result[field])) {
      throw new BadRequestError(`${field} must be a non-negative number`);
    }
  }
  const maxUses = result.discount_max_uses;
  if (maxUses !== undefined && (typeof maxUses !== "number" || !Number.isInteger(maxUses) || maxUses <= 0)) {
    throw new BadRequestError("discount_max_uses must be a positive integer");
  }
  if (result.discount_type === "percentage" && Number(result.discount_value) > 100) {
    throw new BadRequestError("Percentage discount cannot exceed 100");
  }
  if (result.discount_productIds !== undefined) {
    const ids: unknown = result.discount_productIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      throw new BadRequestError("discount_productIds must be an array of IDs");
    }
    result.discount_productIds = [...new Set(ids as string[])];
    result.discount_productIds.forEach((id) => validateObjectId(id, "discount_productIds"));
  }
  return result;
};

export interface DiscountRules {
  startDate: Date;
  endDate: Date;
  /** Only a newly supplied start date has to be in the future. */
  startDateChanged: boolean;
  type: DiscountType;
  value: number;
  appliesTo: DiscountAppliesTo;
  productIds: string[];
}

/** Cross-field rules evaluated on the effective (merged) discount values. */
export const validateDiscountRules = (rules: DiscountRules, now = new Date()) => {
  const { startDate, endDate } = rules;
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new BadRequestError("Discount start and end dates must be valid");
  }
  if (rules.startDateChanged && startDate < now) {
    throw new BadRequestError("Discount start date must be after the current date");
  }
  if (endDate <= startDate) {
    throw new BadRequestError("Discount end date must be after the start date");
  }
  if (rules.type === "percentage" && rules.value > 100) {
    throw new BadRequestError("Percentage discount cannot exceed 100");
  }
  if (rules.appliesTo === "specific_products" && rules.productIds.length === 0) {
    throw new BadRequestError(
      "Discount must apply to at least one product when 'discount_applies_to' is 'specific_products'",
    );
  }
};

export const validateDiscountCartItems = (products: DiscountCartItemInput[]) => {
  if (!products.length) throw new BadRequestError("Products cannot be empty");

  products.forEach((product, index) => {
    if (!product || typeof product.productId !== "string") {
      throw new BadRequestError(`products[${index}].productId must be a string`);
    }
    validateObjectId(product.productId, `products[${index}].productId`);
    if (!Number.isInteger(product.quantity) || product.quantity <= 0) {
      throw new BadRequestError(`products[${index}].quantity must be a positive integer`);
    }
  });

  if (new Set(products.map((product) => product.productId)).size !== products.length) {
    throw new BadRequestError("Products must not contain duplicate productId values");
  }
};

export const parseCalculateDiscountInput = (body: CalculateDiscountInput) => {
  if (!Array.isArray(body?.products) || !body.sellerId) {
    throw new BadRequestError("Discount ID, products, and sellerId are required");
  }
  return { products: body.products, sellerId: String(body.sellerId) };
};
