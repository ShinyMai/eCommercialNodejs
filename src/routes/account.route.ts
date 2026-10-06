import { Router } from "express";
import AccountController from "#/controllers/account.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { requireMinimumRole } from "#/middlewares/authorization.middleware.js";

const router = Router();
const buyer = requireMinimumRole("buyer");
const admin = requireMinimumRole("admin");

router.use(authentication);

router.get("/me", buyer, asyncHandler(AccountController.me));
router.patch("/me/profile", buyer, asyncHandler(AccountController.updateMyProfile));

router.get("/", admin, asyncHandler(AccountController.list));
router.patch("/:id/role", admin, asyncHandler(AccountController.updateRole));
router.patch("/:id/approve-seller", admin, asyncHandler(AccountController.approveSeller));
router.patch("/:id/status", admin, asyncHandler(AccountController.updateStatus));

export default router;
