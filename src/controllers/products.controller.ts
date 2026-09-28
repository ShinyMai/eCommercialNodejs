"use strict";

import { ProductFactory } from "#/services/products.service.js";
import { SuccessResponse } from "#/core/success.response.js";
import { Request, Response } from "express";
import type { RequestWithKeyStore } from "#/auth/authUtils.js";
import { getPagination } from "#/common/utils/index.js";
import {
  BadRequestError,
  NotFoundError,
} from "#/core/error.response.js";

class ProductController {
  static async createProduct(req: RequestWithKeyStore, res: Response) {
    return SuccessResponse.created(res, {
      message: "Product created successfully",
      items: await ProductFactory.createProduct(req.body.product_type, {
        ...req.body,
        product_shop: req.userId,
      }),
    });
  }

  static async updateProduct(req: RequestWithKeyStore, res: Response) {
    const productId = String(req.params.id);
    const shopId = String(req.userId);
    if (!productId) {
      throw new BadRequestError("Product ID is required");
    }

    return SuccessResponse.ok(res, {
      message: "Product updated successfully",
      items: await ProductFactory.updateProduct(
        productId,
        shopId,
        req.body.product_type,
        req.body,
      ),
    });
  }

  static async setPublication(req: RequestWithKeyStore, res: Response) {
    const productIds = req.body.productIds ?? req.body.product_id;
    if (
      !Array.isArray(productIds) ||
      productIds.some((id) => typeof id !== "string") ||
      typeof req.body.isPublished !== "boolean"
    ) {
      throw new BadRequestError("productIds and isPublished are required");
    }

    return SuccessResponse.ok(res, {
      message: `Products ${req.body.isPublished ? "published" : "unpublished"} successfully`,
      items: await ProductFactory.setPublication({
        shopId: String(req.userId),
        productIds,
        isPublished: req.body.isPublished,
      }),
    });
  }

  static async listShopProducts(req: RequestWithKeyStore, res: Response) {
    const { limit, page, skip } = getPagination(req.query);
    const status = String(req.query.status ?? "all");
    if (!["draft", "published", "all"].includes(status)) {
      throw new BadRequestError("status must be draft, published, or all");
    }

    return SuccessResponse.ok(res, {
      message: "Shop products retrieved successfully",
      items: await ProductFactory.listShopProducts({
        shopId: String(req.userId),
        status: status as "draft" | "published" | "all",
        limit,
        skip,
      }),
      pagination: { page, limit },
    });
  }

  static async listPublishedProducts(req: Request, res: Response) {
    const { limit, page, skip } = getPagination(req.query);
    const sort = req.query.sort === "oldest" ? "oldest" : "newest";
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim() || undefined
        : undefined;

    return SuccessResponse.ok(res, {
      message: "Products retrieved successfully",
      items: await ProductFactory.listPublishedProducts({
        search,
        limit,
        skip,
        sort,
      }),
      pagination: { page, limit },
    });
  }

  static async detailProduct(req: Request, res: Response) {
    const productId = req.params.id as string;
    if (!productId) {
      throw new BadRequestError("Product ID is required");
    }

    const product = await ProductFactory.detailProduct(productId);
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    return SuccessResponse.ok(res, {
      message: "Product details retrieved successfully",
      items: product,
    });
  }
}

export default ProductController;
