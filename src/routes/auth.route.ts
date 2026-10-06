import { Router } from "express";
import config from "#/configs/index.js";
import AuthController from "#/controllers/auth.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { createRateLimiter } from "#/middlewares/rateLimit.middleware.js";

const router = Router();
const { signupRateLimit, loginRateLimit, refreshRateLimit } = config.auth;

const signupLimiter = createRateLimiter({
  ...signupRateLimit,
  message: "Too many signup attempts; please try again later",
});
const loginLimiter = createRateLimiter({
  ...loginRateLimit,
  message: "Too many login attempts; please try again later",
});
const refreshLimiter = createRateLimiter({
  ...refreshRateLimit,
  message: "Too many token refresh attempts; please try again later",
});

router.post("/signup", signupLimiter, asyncHandler(AuthController.signupBuyer));
router.post("/register/seller", signupLimiter, asyncHandler(AuthController.registerSeller));
router.post("/login", loginLimiter, asyncHandler(AuthController.login));
router.post("/refresh-token", refreshLimiter, asyncHandler(AuthController.refresh));

router.post("/logout", authentication, asyncHandler(AuthController.logout));

export default router;
