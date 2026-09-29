"use strict";

import { Router } from "express";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { requireMinimumRole } from "#/middlewares/authorization.middleware.js";
import DiscountController from "#/controllers/discount.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";

const router = Router();

router.get(
  "/",
  asyncHandler(DiscountController.getListDiscountCode),
);
router.post(
  "/:id/calculate",
  authentication,
  requireMinimumRole("buyer"),
  asyncHandler(DiscountController.getDiscountAmount),
);
router.post(
  "/",
  authentication,
  requireMinimumRole("seller"),
  asyncHandler(DiscountController.createDiscountCode),
);
router.patch(
  "/:id/cancel",
  authentication,
  requireMinimumRole("seller"),
  asyncHandler(DiscountController.cancelDiscountCode),
);
router.patch(
  "/:id",
  authentication,
  requireMinimumRole("seller"),
  asyncHandler(DiscountController.updateDiscountCode),
);
router.delete(
  "/:id",
  authentication,
  requireMinimumRole("seller"),
  asyncHandler(DiscountController.deleteDiscountCode),
);

export default router;
