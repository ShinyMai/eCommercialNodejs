"use strict";

import type { Response } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import CheckoutService from "#/services/checkout.service.js";

class CheckoutController {
  static async reviewCheckout(req: AuthenticatedRequest<unknown>, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Checkout review completed successfully",
      items: await CheckoutService.reviewCheckout(req.body, req.auth.accountId),
    });
  }
}

export default CheckoutController;
