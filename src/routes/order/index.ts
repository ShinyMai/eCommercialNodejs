import { Router } from "express";
import OrderController from "#/controllers/order.controller.js";
import { authentication } from "#/middlewares/authentication.middleware.js";
import { requireMinimumRole } from "#/middlewares/authorization.middleware.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";

const router = Router();
router.use(authentication, requireMinimumRole("buyer"));
router.post("/", asyncHandler(OrderController.create));
router.get("/:orderId", asyncHandler(OrderController.get));
router.post("/:orderId/cancel", asyncHandler(OrderController.cancel));
export default router;
