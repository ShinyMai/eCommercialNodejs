import type { Request, Response } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import DiscountService from "#/services/discount.service.js";
import { getPagination, getQueryString } from "#/utils/index.js";
import {
  parseCalculateDiscountInput,
  type CalculateDiscountInput,
  type DiscountInput,
} from "#/validators/discount.validator.js";

class DiscountController {
  static async createDiscountCode(req: AuthenticatedRequest<DiscountInput>, res: Response) {
    return SuccessResponse.created(res, {
      message: "Discount code created successfully",
      items: await DiscountService.createDiscountCode(req.body, req.auth.accountId),
    });
  }

  static async updateDiscountCode(req: AuthenticatedRequest<Partial<DiscountInput>>, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Discount code updated successfully",
      items: await DiscountService.updateDiscountCode(String(req.params.id), req.body, req.auth.accountId),
    });
  }

  static async getListDiscountCode(req: Request, res: Response) {
    const { limit, page } = getPagination(req.query);
    return SuccessResponse.ok(res, {
      message: "Discount codes retrieved successfully",
      items: await DiscountService.getListDiscountCode({
        sellerId: getQueryString(req.query, "sellerId"),
        productId: getQueryString(req.query, "productId"),
        limit,
        page,
      }),
      pagination: { page, limit },
    });
  }

  static async getDiscountAmount(req: AuthenticatedRequest<CalculateDiscountInput>, res: Response) {
    const { products, sellerId } = parseCalculateDiscountInput(req.body);
    return SuccessResponse.ok(res, {
      message: "Discount amount calculated successfully",
      items: await DiscountService.getDiscountAmount(String(req.params.id), products, sellerId, req.auth.accountId),
    });
  }

  static async deleteDiscountCode(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Discount code deleted successfully",
      items: await DiscountService.deleteDiscountCode(String(req.params.id), req.auth.accountId),
    });
  }

  static async cancelDiscountCode(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Discount code cancelled successfully",
      items: await DiscountService.cancelDiscountCode(String(req.params.id), req.auth.accountId),
    });
  }
}

export default DiscountController;
