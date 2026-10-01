"use strict";

import { Router } from "express";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { requireMinimumRole } from "#/middlewares/authorization.middleware.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { cartController } from "#/controllers/carts.controller.js";

const router = Router();

router.get("/", authentication, requireMinimumRole("buyer"), asyncHandler(cartController.getCart));
router.post("/items", authentication, requireMinimumRole("buyer"), asyncHandler(cartController.addToCart));
router.patch(
  "/items/:productId",
  authentication,
  requireMinimumRole("buyer"),
  asyncHandler(cartController.updateCart),
);
router.delete(
  "/items/:productId",
  authentication,
  requireMinimumRole("buyer"),
  asyncHandler(cartController.removeProductFromCart),
);
router.delete("/", authentication, requireMinimumRole("buyer"), asyncHandler(cartController.clearCart));

export default router;
