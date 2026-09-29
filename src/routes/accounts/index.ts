"use strict";

import AccountsController from "#/controllers/accounts.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { requireMinimumRole } from "#/middlewares/authorization.middleware.js";
import { Router } from "express";

const router = Router();

router.use(authentication);
router.get("/me", requireMinimumRole("buyer"), asyncHandler(AccountsController.me));
router.patch(
  "/me/profile",
  requireMinimumRole("buyer"),
  asyncHandler(AccountsController.updateMyProfile),
);
router.get("/", requireMinimumRole("admin"), asyncHandler(AccountsController.list));
router.patch("/:id/role", requireMinimumRole("admin"), asyncHandler(AccountsController.updateRole));
router.patch("/:id/status", requireMinimumRole("admin"), asyncHandler(AccountsController.updateStatus));

export default router;
