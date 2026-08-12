"use strict";

import { Router } from "express";
import AccessController from "@/controllers/access.controller.js";
import { asyncHandler } from "@/helpers/asyncHandler.js";
import { authentication } from "@/auth/authUtils.js";

const router = Router();

// Shop routes
router.post("/auth/signup", asyncHandler(AccessController.shopSignup));
router.post("/auth/login", asyncHandler(AccessController.shopLogin));
router.post(
  "/auth/refresh-token",
  asyncHandler(AccessController.handleRefreshToken),
);

//authentication routes (require a valid accessToken)
router.use(authentication);
router.post("/auth/logout", asyncHandler(AccessController.logout));

export default router;
