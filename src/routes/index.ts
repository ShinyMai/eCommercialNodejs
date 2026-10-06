"use strict";

import { Router } from "express";
import authRouter from "#/routes/auth/index.js";
import productRouter from "#/routes/product/index.js";
import discountRouter from "#/routes/discount/index.js";
import accountRouter from "#/routes/accounts/index.js";
import cartRouter from "#/routes/cart/index.js";
import checkoutRouter from "#/routes/checkout/index.js";
import orderRouter from "#/routes/order/index.js";
import { SuccessResponse } from "#/core/success.response.js";

const router = Router();

router.get("/health", (_req, res) => {
  return SuccessResponse.ok(res, {
    message: "Service is healthy",
    items: null,
  });
});

router.use("/auth", authRouter);
router.use("/products", productRouter);
router.use("/discounts", discountRouter);
router.use("/accounts", accountRouter);
router.use("/cart", cartRouter);
router.use("/checkout", checkoutRouter);
router.use("/orders", orderRouter);

export default router;
