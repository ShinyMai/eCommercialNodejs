"use strict";

import { Router } from "express";
import accessRouter from "@/routes/access/index.js";
import { apiKey, checkPermission } from "@/auth/checkAuth.js";

const router = Router();

//check apiKey
router.use(apiKey);
//check permission
router.use(checkPermission("READ"));

router.use("/v1/api", accessRouter);

export default router;
