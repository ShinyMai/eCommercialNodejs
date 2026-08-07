"use strict";

import { Router } from "express";
import AccessController from "@/controllers/access.controller.js";
import { asyncHandler } from "@/auth/checkAuth.js";

const router = Router();

router.post("/create/key", asyncHandler(AccessController.createApiKey));

export default router;
