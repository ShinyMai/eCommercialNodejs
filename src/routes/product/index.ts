"use strict";

import { Router } from "express";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import ProductController from "#/controllers/products.controller.js";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { requireMinimumRole } from "#/middlewares/authorization.middleware.js";

const router = Router();

router.get("/", asyncHandler(ProductController.listPublishedProducts));
router.get(
  "/seller",
  authentication,
  requireMinimumRole("seller"),
  asyncHandler(ProductController.listSellerProducts),
);
router.get("/:id", asyncHandler(ProductController.detailProduct));
router.post(
  "/",
  authentication,
  requireMinimumRole("seller"),
  asyncHandler(ProductController.createProduct),
);
router.patch(
  "/publication",
  authentication,
  requireMinimumRole("seller"),
  asyncHandler(ProductController.setPublication),
);
router.patch(
  "/:id",
  authentication,
  requireMinimumRole("seller"),
  asyncHandler(ProductController.updateProduct),
);

export default router;
