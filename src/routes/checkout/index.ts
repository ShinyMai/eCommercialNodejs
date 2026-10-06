"use strict";

import { Router } from "express";
import CheckoutController from "#/controllers/checkout.controller.js";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { requireMinimumRole } from "#/middlewares/authorization.middleware.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";

const router = Router();

router.post("/review", authentication, requireMinimumRole("buyer"), asyncHandler(CheckoutController.reviewCheckout));

export default router;
