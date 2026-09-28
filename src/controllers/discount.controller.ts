"use strict";

import { SuccessResponse } from "#/core/success.response.js";
import { Request, Response } from "express";
import type { RequestWithKeyStore } from "#/auth/authUtils.js";
import { getPagination } from "#/common/utils/index.js";
import { BadRequestError } from "#/core/error.response.js";
import DiscountService from "#/services/discount.service.js";

class DiscountController {
  static async createDiscountCode(req: RequestWithKeyStore, res: Response) {
    return SuccessResponse.created(res, {
      message: "Discount code created successfully",
      items: await DiscountService.createDiscountCode({
        ...req.body,
        discount_shopId: String(req.userId),
        is_deleted: false,
      }),
    });
  }

  static async updateDiscountCode(req: RequestWithKeyStore, res: Response) {
    const discountId = String(req.params.id);
    if (!discountId) {
      throw new BadRequestError("Discount ID is required");
    }

    return SuccessResponse.ok(res, {
      message: "Discount code updated successfully",
      items: await DiscountService.updateDiscountCode(discountId, {
        ...req.body,
        discount_shopId: String(req.userId),
      }),
    });
  }

  static async getListDiscountCode(req: RequestWithKeyStore, res: Response) {
    const { limit, page } = getPagination(req.query);
    const shopId = typeof req.userId === "string" ? req.userId : undefined;
    const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;

    return SuccessResponse.ok(res, {
      message: "Discount codes retrieved successfully",
      items: await DiscountService.getListDiscountCode({
        shopId,
        productId,
        limit,
        page,
      }),
      pagination: { page, limit },
    });
  }

  static async getDiscountAmount(req: Request, res: Response) {
    const discountId = String(req.params.id);
    const { products, shopId, userId } = req.body;

    if (!discountId || !Array.isArray(products) || !shopId || !userId) {
      throw new BadRequestError("Discount ID, products, shopId, and userId are required");
    }

    return SuccessResponse.ok(res, {
      message: "Discount amount calculated successfully",
      items: await DiscountService.getDiscountAmount(discountId, products, String(shopId), String(userId)),
    });
  }

  static async deleteDiscountCode(req: RequestWithKeyStore, res: Response) {
    const discountId = String(req.params.id);
    if (!discountId) {
      throw new BadRequestError("Discount ID is required");
    }

    return SuccessResponse.ok(res, {
      message: "Discount code deleted successfully",
      items: await DiscountService.deleteDiscountCode(discountId, String(req.userId)),
    });
  }

  static async cancelDiscountCode(req: RequestWithKeyStore, res: Response) {
    const discountId = String(req.params.id);
    if (!discountId) {
      throw new BadRequestError("Discount ID is required");
    }

    return SuccessResponse.ok(res, {
      message: "Discount code cancelled successfully",
      items: await DiscountService.cancelDiscountCode(discountId, String(req.userId)),
    });
  }
}

export default DiscountController;
