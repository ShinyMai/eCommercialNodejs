"use strict";

import { SuccessResponse } from "#/core/success.response.js";
import { Request, Response } from "express";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import { getPagination } from "#/common/utils/index.js";
import { BadRequestError } from "#/core/error.response.js";
import DiscountService from "#/services/discount.service.js";

class DiscountController {
  static async createDiscountCode(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.created(res, {
      message: "Discount code created successfully",
      items: await DiscountService.createDiscountCode(
        req.body,
        req.auth.accountId,
      ),
    });
  }

  static async updateDiscountCode(req: AuthenticatedRequest, res: Response) {
    const discountId = String(req.params.id);
    if (!discountId) {
      throw new BadRequestError("Discount ID is required");
    }

    return SuccessResponse.ok(res, {
      message: "Discount code updated successfully",
      items: await DiscountService.updateDiscountCode(
        discountId,
        req.body,
        req.auth.accountId,
      ),
    });
  }

  static async getListDiscountCode(req: Request, res: Response) {
    const { limit, page } = getPagination(req.query);
    const sellerId = typeof req.query.sellerId === "string" ? req.query.sellerId : undefined;
    const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;

    return SuccessResponse.ok(res, {
      message: "Discount codes retrieved successfully",
      items: await DiscountService.getListDiscountCode({
        sellerId,
        productId,
        limit,
        page,
      }),
      pagination: { page, limit },
    });
  }

  static async getDiscountAmount(req: AuthenticatedRequest, res: Response) {
    const discountId = String(req.params.id);
    const { products, sellerId } = req.body;

    if (!discountId || !Array.isArray(products) || !sellerId) {
      throw new BadRequestError("Discount ID, products, and sellerId are required");
    }

    return SuccessResponse.ok(res, {
      message: "Discount amount calculated successfully",
      items: await DiscountService.getDiscountAmount(
        discountId,
        products,
        String(sellerId),
        req.auth.accountId,
      ),
    });
  }

  static async deleteDiscountCode(req: AuthenticatedRequest, res: Response) {
    const discountId = String(req.params.id);
    if (!discountId) {
      throw new BadRequestError("Discount ID is required");
    }

    return SuccessResponse.ok(res, {
      message: "Discount code deleted successfully",
      items: await DiscountService.deleteDiscountCode(discountId, req.auth.accountId),
    });
  }

  static async cancelDiscountCode(req: AuthenticatedRequest, res: Response) {
    const discountId = String(req.params.id);
    if (!discountId) {
      throw new BadRequestError("Discount ID is required");
    }

    return SuccessResponse.ok(res, {
      message: "Discount code cancelled successfully",
      items: await DiscountService.cancelDiscountCode(discountId, req.auth.accountId),
    });
  }
}

export default DiscountController;
