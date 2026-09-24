"use strict";

import { Router } from "express";
import AccessController from "#/controllers/access.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { protectApiKeyCreation } from "#/auth/checkAuth.js";

const router = Router();

router.post(
  "/",
  protectApiKeyCreation,
  asyncHandler(AccessController.createApiKey),
);

export default router;
