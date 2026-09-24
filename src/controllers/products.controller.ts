"use strict";

import { ProductFactory } from "#/services/products.service.js";
import { SuccessResponse } from "#/core/success.response.js";
import { Request, Response } from "express";
import type { RequestWithKeyStore } from "#/auth/authUtils.js";
import { getPagination } from "#/common/utils/index.js";
import { BadRequestError } from "#/core/error.response.js";

class ProductController {
  static async createProduct(req: RequestWithKeyStore, res: Response) {
    SuccessResponse.created(res, {
      message: "Product created successfully",
      metadata: await ProductFactory.createProduct(req.body.product_type, {
        ...req.body,
        product_shop: req.userId,
      }),
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

    SuccessResponse.ok(res, {
      message: `Products ${req.body.isPublished ? "published" : "unpublished"} successfully`,
      metadata: await ProductFactory.setPublication({
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

    SuccessResponse.ok(res, {
      message: "Shop products retrieved successfully",
      metadata: {
        items: await ProductFactory.listShopProducts({
          shopId: String(req.userId),
          status: status as "draft" | "published" | "all",
          limit,
          skip,
        }),
        pagination: { page, limit },
      },
    });
  }

  static async listPublishedProducts(req: Request, res: Response) {
    const { limit, page, skip } = getPagination(req.query);
    const sort = req.query.sort === "oldest" ? "oldest" : "newest";
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim() || undefined
        : undefined;

    SuccessResponse.ok(res, {
      message: "Products retrieved successfully",
      metadata: {
        items: await ProductFactory.listPublishedProducts({
          search,
          limit,
          skip,
          sort,
        }),
        pagination: { page, limit },
      },
    });
  }
}

export default ProductController;
