"use strict";

import { Router } from "express";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import ProductController from "#/controllers/products.controller.js";
import { authentication } from "#/auth/authUtils.js";
import { checkPermission } from "#/auth/checkAuth.js";

const router = Router();

router.get(
  "/",
  checkPermission("READ"),
  asyncHandler(ProductController.listPublishedProducts),
);

router.use(authentication);
router.get(
  "/shop",
  checkPermission("READ"),
  asyncHandler(ProductController.listShopProducts),
);
router.post(
  "/",
  checkPermission("WRITE"),
  asyncHandler(ProductController.createProduct),
);
router.patch(
  "/publication",
  checkPermission("WRITE"),
  asyncHandler(ProductController.setPublication),
);

export default router;
