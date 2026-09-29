"use strict";

import { Router } from "express";
import AuthController from "#/controllers/auth.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { createRateLimiter } from "#/middlewares/rateLimit.middleware.js";
import config from "#/configs/index.js";

const router = Router();

const signupLimiter = createRateLimiter({
  ...config.auth.signupRateLimit,
  message: "Too many signup attempts; please try again later",
});
const loginLimiter = createRateLimiter({
  ...config.auth.loginRateLimit,
  message: "Too many login attempts; please try again later",
});
const refreshLimiter = createRateLimiter({
  ...config.auth.refreshRateLimit,
  message: "Too many token refresh attempts; please try again later",
});

router.post("/signup", signupLimiter, asyncHandler(AuthController.signupBuyer));
router.post("/signup/seller", signupLimiter, asyncHandler(AuthController.signupSeller));
router.post("/login", loginLimiter, asyncHandler(AuthController.login));
router.post(
  "/refresh-token",
  refreshLimiter,
  asyncHandler(AuthController.refresh),
);

router.use(authentication);
router.post("/logout", asyncHandler(AuthController.logout));

export default router;
