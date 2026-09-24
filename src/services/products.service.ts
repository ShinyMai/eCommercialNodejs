"use strict";

import {
  ClothingModel,
  ElectronicsModel,
  Product,
  ProductModel,
} from "#/models/products.model.js";
import {
  findProducts,
  setProductsPublication,
} from "#/models/repositories/product.repo.js";
import { BadRequestError, NotFoundError } from "#/core/error.response.js";
import { Model, Types } from "mongoose";

type ProductType = Product["product_type"];
type ProductPayload = Product & { product_shop: Types.ObjectId | string };

class ProductFactory {
  private static readonly productRegistry = new Map<
    ProductType,
    Model<unknown>
  >();

  static registerProductType(type: ProductType, model: Model<unknown>) {
    ProductFactory.productRegistry.set(type, model);
  }

  static async createProduct(productType: ProductType, payload: ProductPayload) {
    const attributeModel = ProductFactory.productRegistry.get(productType);
    if (!attributeModel) {
      throw new BadRequestError(`Unsupported product type: ${productType}`);
    }

    const attributes = await attributeModel.create(payload.product_attributes);
    try {
      return await ProductModel.create({
        ...payload,
        product_attributes: attributes.toObject(),
      });
    } catch (error) {
      await attributeModel
        .deleteOne({ _id: attributes._id })
        .catch(() => undefined);
      throw error;
    }
  }

  static async setPublication({
    shopId,
    productIds,
    isPublished,
  }: {
    shopId: string;
    productIds: string[];
    isPublished: boolean;
  }) {
    if (
      !Types.ObjectId.isValid(shopId) ||
      productIds.length === 0 ||
      productIds.some((id) => !Types.ObjectId.isValid(id))
    ) {
      throw new BadRequestError("Invalid shop or product ID");
    }

    const result = await setProductsPublication({
      shopId,
      productIds,
      isPublished,
    });
    if (result.matchedCount === 0) {
      throw new NotFoundError("No matching products found for this shop");
    }
    return result;
  }

  static listShopProducts({
    shopId,
    status,
    limit,
    skip,
  }: {
    shopId: string;
    status: "draft" | "published" | "all";
    limit: number;
    skip: number;
  }) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new BadRequestError("Invalid shop ID");
    }
    const statusFilter =
      status === "all"
        ? {}
        : status === "published"
          ? { isPublished: true }
          : { isDraft: true };

    return findProducts({
      filter: {
        product_shop: new Types.ObjectId(shopId),
        ...statusFilter,
      },
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
      select: [
        "product_name",
        "product_price",
        "product_thumbnail",
        "product_slug",
        "product_shop",
      ],
    });
  }
}

ProductFactory.registerProductType(
  "Clothing",
  ClothingModel as Model<unknown>,
);
ProductFactory.registerProductType(
  "Electronics",
  ElectronicsModel as Model<unknown>,
);

export { ProductFactory };
