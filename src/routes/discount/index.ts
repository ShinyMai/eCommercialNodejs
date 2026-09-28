"use strict";

import { Router } from "express";
import { authentication } from "#/auth/authUtils.js";
import { checkPermission } from "#/auth/checkAuth.js";
import DiscountController from "#/controllers/discount.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";

const router = Router();

router.get(
  "/",
  checkPermission("READ"),
  asyncHandler(DiscountController.getListDiscountCode),
);
router.post(
  "/:id/calculate",
  checkPermission("READ"),
  asyncHandler(DiscountController.getDiscountAmount),
);
router.post(
  "/",
  authentication,
  checkPermission("WRITE"),
  asyncHandler(DiscountController.createDiscountCode),
);
router.patch(
  "/:id/cancel",
  authentication,
  checkPermission("WRITE"),
  asyncHandler(DiscountController.cancelDiscountCode),
);
router.patch(
  "/:id",
  authentication,
  checkPermission("WRITE"),
  asyncHandler(DiscountController.updateDiscountCode),
);
router.delete(
  "/:id",
  authentication,
  checkPermission("DELETE"),
  asyncHandler(DiscountController.deleteDiscountCode),
);

export default router;
