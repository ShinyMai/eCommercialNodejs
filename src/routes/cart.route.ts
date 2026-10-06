import { Router } from "express";
import CartController from "#/controllers/cart.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authorize } from "#/middlewares/authorization.middleware.js";

const router = Router();

router.use(authorize("buyer"));

router.get("/", asyncHandler(CartController.getCart));
router.delete("/", asyncHandler(CartController.clearCart));
router.post("/items", asyncHandler(CartController.addToCart));
router.patch("/items/:productId", asyncHandler(CartController.updateCart));
router.delete("/items/:productId", asyncHandler(CartController.removeProductFromCart));

export default router;
