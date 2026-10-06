import { BadRequestError } from "#/core/error.response.js";
import { PRODUCT_TYPES, toProductSlug, type ProductType } from "#/models/product.model.js";
import type { RuntimeRecord } from "#/types/value.types.js";

export interface ProductAttributesInput {
  brand?: string;
  size?: string;
  material?: string;
  manufacturer?: string;
  model?: string;
  color?: string;
}

export interface CreateProductInput {
  product_name: string;
  product_thumbnail: string;
  product_description?: string;
  product_price: number;
  product_quantity: number;
  product_type: ProductType;
  product_attributes: ProductAttributesInput;
  product_variations?: RuntimeRecord[];
}

export interface SetPublicationInput {
  productIds?: string[];
  /** Legacy alias of `productIds`. */
  product_id?: string[];
  isPublished: boolean;
}

export type ProductUpdate = Partial<Omit<CreateProductInput, "product_type">> & { product_slug?: string };

const SELLER_PRODUCT_STATUSES = ["draft", "published", "all"] as const;
export type SellerProductStatus = (typeof SELLER_PRODUCT_STATUSES)[number];

const REQUIRED_ATTRIBUTES: Record<ProductType, readonly (keyof ProductAttributesInput)[]> = {
  Clothing: ["brand", "size", "material"],
  Electronics: ["manufacturer", "model", "color"],
};

const asRecord = <T extends object>(value: T, field: string): T => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an object`);
  }
  return value;
};

const requiredString = (value: string | undefined, field: string, maxLength = 500): string => {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestError(`${field} is required`);
  const result = value.trim();
  if (result.length > maxLength) throw new BadRequestError(`${field} must not exceed ${maxLength} characters`);
  return result;
};

const nonNegativeNumber = (value: number | undefined, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new BadRequestError(`${field} must be a non-negative number`);
  }
  return value;
};

const nonNegativeInteger = (value: number | undefined, field: string): number => {
  const result = nonNegativeNumber(value, field);
  if (!Number.isInteger(result)) throw new BadRequestError(`${field} must be an integer`);
  return result;
};

const parseProductType = (value: ProductType | undefined): ProductType => {
  if (!PRODUCT_TYPES.includes(value as ProductType)) {
    throw new BadRequestError(`product_type must be one of: ${PRODUCT_TYPES.join(", ")}`);
  }
  return value as ProductType;
};

const parseAttributes = (value: ProductAttributesInput, productType: ProductType): Record<string, string> => {
  const attributes = asRecord(value, "product_attributes");
  return Object.fromEntries(
    REQUIRED_ATTRIBUTES[productType].map((field) => [
      field,
      requiredString(attributes[field], `product_attributes.${field}`, 150),
    ]),
  );
};

export const parseCreateProductInput = (value: CreateProductInput) => {
  const input = asRecord(value, "product");
  const productType = parseProductType(input.product_type);
  return {
    product_name: requiredString(input.product_name, "product_name", 200),
    product_thumbnail: requiredString(input.product_thumbnail, "product_thumbnail", 2_000),
    product_description: typeof input.product_description === "string" ? input.product_description.trim() : "",
    product_price: nonNegativeNumber(input.product_price, "product_price"),
    product_quantity: nonNegativeInteger(input.product_quantity, "product_quantity"),
    product_type: productType,
    product_attributes: parseAttributes(input.product_attributes, productType),
    product_variations: Array.isArray(input.product_variations) ? input.product_variations : [],
  };
};

export const parseUpdateProductInput = (
  value: Partial<CreateProductInput>,
  existingType: ProductType,
): ProductUpdate => {
  const input = asRecord(value, "product");
  if (input.product_type !== undefined && parseProductType(input.product_type) !== existingType) {
    throw new BadRequestError("product_type cannot be changed");
  }

  const update: ProductUpdate = {};
  if (input.product_name !== undefined) {
    update.product_name = requiredString(input.product_name, "product_name", 200);
    update.product_slug = toProductSlug(update.product_name);
  }
  if (input.product_thumbnail !== undefined) {
    update.product_thumbnail = requiredString(input.product_thumbnail, "product_thumbnail", 2_000);
  }
  if (input.product_description !== undefined) {
    if (typeof input.product_description !== "string") {
      throw new BadRequestError("product_description must be a string");
    }
    update.product_description = input.product_description.trim();
  }
  if (input.product_price !== undefined) {
    update.product_price = nonNegativeNumber(input.product_price, "product_price");
  }
  if (input.product_quantity !== undefined) {
    update.product_quantity = nonNegativeInteger(input.product_quantity, "product_quantity");
  }
  if (input.product_attributes !== undefined) {
    update.product_attributes = parseAttributes(input.product_attributes, existingType);
  }
  if (input.product_variations !== undefined) {
    if (!Array.isArray(input.product_variations)) throw new BadRequestError("product_variations must be an array");
    update.product_variations = input.product_variations;
  }

  if (!Object.keys(update).length) throw new BadRequestError("No supported product fields to update");
  return update;
};

export const parseSetPublicationInput = (body: SetPublicationInput) => {
  const productIds = body?.productIds ?? body?.product_id;
  if (
    !Array.isArray(productIds) ||
    productIds.some((id) => typeof id !== "string") ||
    typeof body.isPublished !== "boolean"
  ) {
    throw new BadRequestError("productIds and isPublished are required");
  }
  return { productIds, isPublished: body.isPublished };
};

export const parseSellerProductStatus = (value = "all"): SellerProductStatus => {
  if (!SELLER_PRODUCT_STATUSES.includes(value as SellerProductStatus)) {
    throw new BadRequestError("status must be draft, published, or all");
  }
  return value as SellerProductStatus;
};
