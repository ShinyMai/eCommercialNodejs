import { Router } from "express";
import ProductController from "#/controllers/product.controller.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authorize } from "#/middlewares/authorization.middleware.js";

const router = Router();
const seller = authorize("seller");

// Static paths must be registered before "/:id".
router.get("/", asyncHandler(ProductController.listPublishedProducts));
router.get("/seller", seller, asyncHandler(ProductController.listSellerProducts));
router.get("/:id", asyncHandler(ProductController.detailProduct));

router.post("/", seller, asyncHandler(ProductController.createProduct));
router.patch("/publication", seller, asyncHandler(ProductController.setPublication));
router.patch("/:id", seller, asyncHandler(ProductController.updateProduct));

export default router;
