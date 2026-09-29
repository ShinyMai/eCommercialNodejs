"use strict";

import { BadRequestError, NotFoundError } from "#/core/error.response.js";
import { ProductModel } from "#/models/products.model.js";
import {
  detailProduct,
  findProducts,
  setProductsPublication,
} from "#/models/repositories/product.repo.js";
import {
  insertInventory,
  setInventoryStock,
} from "#/models/repositories/inventory.repo.js";
import { Types } from "mongoose";
import slugify from "slugify";
import type { RuntimeRecord } from "#/types/value.types.js";

type ProductType = "Clothing" | "Electronics";

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
  product_id?: string[];
  isPublished: boolean;
}

type ProductUpdate = Partial<Omit<CreateProductInput, "product_type">> & {
  product_slug?: string;
};

const PRODUCT_TYPES: readonly ProductType[] = ["Clothing", "Electronics"];

const asRecord = <T extends object>(value: T, field: string): T => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an object`);
  }
  return value;
};

const requiredString = (value: string | undefined, field: string, maxLength = 500): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestError(`${field} is required`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new BadRequestError(`${field} must not exceed ${maxLength} characters`);
  }
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
  if (!Number.isInteger(result)) {
    throw new BadRequestError(`${field} must be an integer`);
  }
  return result;
};

const parseProductType = (value: ProductType | undefined): ProductType => {
  if (!PRODUCT_TYPES.includes(value as ProductType)) {
    throw new BadRequestError(`product_type must be one of: ${PRODUCT_TYPES.join(", ")}`);
  }
  return value as ProductType;
};

const parseAttributes = (
  value: ProductAttributesInput,
  productType: ProductType,
): Record<string, string> => {
  const attributes = asRecord(value, "product_attributes");
  const fields = productType === "Clothing"
    ? ["brand", "size", "material"] as const
    : ["manufacturer", "model", "color"] as const;
  return Object.fromEntries(
    fields.map((field) => [field, requiredString(attributes[field], `product_attributes.${field}`, 150)]),
  );
};

const parseCreateInput = (value: CreateProductInput) => {
  const input = asRecord(value, "product");
  const productType = parseProductType(input.product_type);
  return {
    product_name: requiredString(input.product_name, "product_name", 200),
    product_thumbnail: requiredString(input.product_thumbnail, "product_thumbnail", 2_000),
    product_description: typeof input.product_description === "string"
      ? input.product_description.trim()
      : "",
    product_price: nonNegativeNumber(input.product_price, "product_price"),
    product_quantity: nonNegativeInteger(input.product_quantity, "product_quantity"),
    product_type: productType,
    product_attributes: parseAttributes(input.product_attributes, productType),
    product_variations: Array.isArray(input.product_variations) ? input.product_variations : [],
  };
};

const parseUpdateInput = (
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
    update.product_slug = slugify(update.product_name as string, { lower: true });
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
    if (!Array.isArray(input.product_variations)) {
      throw new BadRequestError("product_variations must be an array");
    }
    update.product_variations = input.product_variations;
  }
  if (!Object.keys(update).length) throw new BadRequestError("No supported product fields to update");
  return update;
};

class ProductService {
  static async createProduct(input: CreateProductInput, sellerId: string) {
    if (!Types.ObjectId.isValid(sellerId)) throw new BadRequestError("Invalid seller ID");
    const payload = parseCreateInput(input);
    const newProduct = await ProductModel.create({ ...payload, product_seller: sellerId });

    try {
      await insertInventory({
        inven_productId: newProduct._id,
        inven_location: "default",
        inven_stock: payload.product_quantity,
        inven_sellerId: new Types.ObjectId(sellerId),
      });
      return newProduct;
    } catch (error) {
      await ProductModel.deleteOne({ _id: newProduct._id }).catch(() => undefined);
      throw error;
    }
  }

  static async updateProduct(productId: string, sellerId: string, input: Partial<CreateProductInput>) {
    if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(sellerId)) {
      throw new BadRequestError("Invalid seller or product ID");
    }
    const existing = await ProductModel.findOne({
      _id: productId,
      product_seller: sellerId,
    }).select("product_type").lean();
    if (!existing) throw new NotFoundError("Product not found");

    const update = parseUpdateInput(input, existing.product_type);
    const product = await ProductModel.findOneAndUpdate(
      { _id: productId, product_seller: sellerId },
      { $set: update },
      { new: true, runValidators: true },
    ).exec();
    if (!product) throw new NotFoundError("Product not found");

    if (typeof update.product_quantity === "number") {
      await setInventoryStock(productId, sellerId, update.product_quantity);
    }
    return product;
  }

  static async setPublication({
    sellerId,
    productIds,
    isPublished,
  }: {
    sellerId: string;
    productIds: string[];
    isPublished: boolean;
  }) {
    if (
      !Types.ObjectId.isValid(sellerId) ||
      productIds.length === 0 ||
      productIds.some((id) => !Types.ObjectId.isValid(id))
    ) {
      throw new BadRequestError("Invalid seller or product ID");
    }
    const uniqueProductIds = [...new Set(productIds)];
    const result = await setProductsPublication({ sellerId, productIds: uniqueProductIds, isPublished });
    if (result.matchedCount === 0) {
      throw new NotFoundError("No matching products found for this seller");
    }
    return result;
  }

  static listSellerProducts({
    sellerId,
    status,
    limit,
    skip,
  }: {
    sellerId: string;
    status: "draft" | "published" | "all";
    limit: number;
    skip: number;
  }) {
    if (!Types.ObjectId.isValid(sellerId)) throw new BadRequestError("Invalid seller ID");
    const statusFilter = status === "all"
      ? {}
      : status === "published"
        ? { isPublished: true }
        : { isDraft: true };
    return findProducts({
      filter: { product_seller: new Types.ObjectId(sellerId), ...statusFilter },
      limit,
      skip,
    });
  }

  static listPublishedProducts({
    search,
    limit,
    skip,
    sort = "newest",
  }: {
    search?: string;
    limit: number;
    skip: number;
    sort?: "newest" | "oldest";
  }) {
    return findProducts({
      filter: { isPublished: true },
      search,
      limit,
      skip,
      sort,
      select: ["product_name", "product_price", "product_thumbnail", "product_slug", "product_seller"],
    });
  }

  static detailProduct(productId: string) {
    return detailProduct(productId);
  }
}

export { ProductService };
