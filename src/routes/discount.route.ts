import { Router } from "express";
import DiscountController from "#/controllers/discount.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authorize } from "#/middlewares/authorization.middleware.js";

const router = Router();
const seller = authorize("seller");

router.get("/", asyncHandler(DiscountController.getListDiscountCode));
router.post("/:id/calculate", authorize("buyer"), asyncHandler(DiscountController.getDiscountAmount));

router.post("/", seller, asyncHandler(DiscountController.createDiscountCode));
router.patch("/:id/cancel", seller, asyncHandler(DiscountController.cancelDiscountCode));
router.patch("/:id", seller, asyncHandler(DiscountController.updateDiscountCode));
router.delete("/:id", seller, asyncHandler(DiscountController.deleteDiscountCode));

export default router;
