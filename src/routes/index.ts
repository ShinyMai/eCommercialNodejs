"use strict";

import { Router } from "express";
import apiKeyRouter from "@/routes/apiKey/index.js";
import authRouter from "@/routes/auth/index.js";
import { apiKey, checkPermission } from "@/auth/checkAuth.js";

const router = Router();

router.use("/v1/api", apiKeyRouter);

//check apiKey
router.use(apiKey);
//check permission
router.use(checkPermission("READ"));

router.use("/v1/api", authRouter);

export default router;
