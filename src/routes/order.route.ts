import { Router } from "express";
import OrderController from "#/controllers/order.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authorize } from "#/middlewares/authorization.middleware.js";

const router = Router();

router.use(authorize("buyer"));

router.post("/", asyncHandler(OrderController.create));
router.get("/:orderId", asyncHandler(OrderController.get));
router.post("/:orderId/cancel", asyncHandler(OrderController.cancel));

export default router;
