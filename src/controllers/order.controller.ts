import type { Response } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import OrderService from "#/services/order.service.js";

class OrderController {
  static async create(req: AuthenticatedRequest<unknown>, res: Response) {
    return SuccessResponse.created(res, {
      message: "Order created successfully",
      items: await OrderService.createOrder(req.body, req.auth.accountId),
    });
  }

  static async get(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Order retrieved successfully",
      items: await OrderService.getOrder(String(req.params.orderId), req.auth.accountId),
    });
  }

  static async cancel(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Order cancelled",
      items: await OrderService.cancelOrder(String(req.params.orderId), req.auth.accountId),
    });
  }
}

export default OrderController;
