import { Router } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import accountRouter from "#/routes/account.route.js";
import authRouter from "#/routes/auth.route.js";
import cartRouter from "#/routes/cart.route.js";
import checkoutRouter from "#/routes/checkout.route.js";
import discountRouter from "#/routes/discount.route.js";
import orderRouter from "#/routes/order.route.js";
import productRouter from "#/routes/product.route.js";

const router = Router();

router.get("/health", (_req, res) => SuccessResponse.ok(res, { message: "Service is healthy", items: null }));

router.use("/auth", authRouter);
router.use("/products", productRouter);
router.use("/discounts", discountRouter);
router.use("/accounts", accountRouter);
router.use("/cart", cartRouter);
router.use("/checkout", checkoutRouter);
router.use("/orders", orderRouter);

export default router;
