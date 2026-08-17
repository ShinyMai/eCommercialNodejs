"use strict";

import { Router } from "express";
import { asyncHandler } from "@/helpers/asyncHandler.js";
import ProductController from "@/controllers/products.controller.js";
import { authentication } from "@/auth/authUtils.js";

const router = Router();

router.use(authentication);
router.post("/create", asyncHandler(ProductController.createProduct));

export default router;
