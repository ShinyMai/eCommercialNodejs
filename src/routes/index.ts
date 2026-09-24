"use strict";

import { Router } from "express";
import apiKeyRouter from "#/routes/apiKey/index.js";
import authRouter from "#/routes/auth/index.js";
import productRouter from "#/routes/product/index.js";
import { apiKey } from "#/auth/checkAuth.js";
import { SuccessResponse } from "#/core/success.response.js";

const router = Router();

router.get("/health", (_req, res) => {
  SuccessResponse.ok(res, { message: "Service is healthy", metadata: {} });
});

router.use("/keys", apiKeyRouter);

router.use(apiKey);

router.use("/auth", authRouter);
router.use("/products", productRouter);

export default router;
