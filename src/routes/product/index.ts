"use strict";

import { Router } from "express";
import { asyncHandler } from "@/helpers/asyncHandler.js";
import ProductController from "@/controllers/products.controller.js";
import { authentication } from "@/auth/authUtils.js";

const router = Router();

router.get("/published/all", asyncHandler(ProductController.findAllPublishedForShop));

router.use(authentication);
router.post("/create", asyncHandler(ProductController.createProduct));
router.post("/publish", asyncHandler(ProductController.publishProduct));
router.post("/unpublish", asyncHandler(ProductController.unPublishProduct));

router.get("/drafts/all", asyncHandler(ProductController.findAllDraftsForShop));

export default router;
