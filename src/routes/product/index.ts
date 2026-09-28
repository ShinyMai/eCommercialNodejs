"use strict";

import { Router } from "express";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import ProductController from "#/controllers/products.controller.js";
import { authentication } from "#/auth/authUtils.js";
import { checkPermission } from "#/auth/checkAuth.js";

const router = Router();

router.get("/", checkPermission("READ"), asyncHandler(ProductController.listPublishedProducts));
router.get(
  "/shop",
  authentication,
  checkPermission("READ"),
  asyncHandler(ProductController.listShopProducts),
);
router.get("/:id", checkPermission("READ"), asyncHandler(ProductController.detailProduct));
router.post(
  "/",
  authentication,
  checkPermission("WRITE"),
  asyncHandler(ProductController.createProduct),
);
router.patch(
  "/publication",
  authentication,
  checkPermission("WRITE"),
  asyncHandler(ProductController.setPublication),
);
router.patch(
  "/:id",
  authentication,
  checkPermission("WRITE"),
  asyncHandler(ProductController.updateProduct),
);

export default router;
