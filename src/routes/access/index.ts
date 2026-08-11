"use strict";

import { Router } from "express";
import AccessController from "@/controllers/access.controller.js";
import { asyncHandler } from "@/helpers/asyncHandler.js";

const router = Router();

// Shop routes
router.post("/shop/signup", asyncHandler(AccessController.shopSignup));
router.post("/shop/login", asyncHandler(AccessController.shopLogin));

//authentication routes

// Key routes
router.post("/create/key", asyncHandler(AccessController.createApiKey));

export default router;
