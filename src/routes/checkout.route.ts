import { Router } from "express";
import CheckoutController from "#/controllers/checkout.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authorize } from "#/middlewares/authorization.middleware.js";

const router = Router();

router.post("/review", authorize("buyer"), asyncHandler(CheckoutController.reviewCheckout));

export default router;
