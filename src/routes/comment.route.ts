import { Router } from "express";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import { authorize } from "#/middlewares/authorization.middleware.js";
import CommentController from "#/controllers/comment.controller.js";

const router = Router();

router.get("/products/:productId", asyncHandler(CommentController.listProductComments));
router.get("/:id/replies", asyncHandler(CommentController.listChildComments));
router.get("/:id/thread", asyncHandler(CommentController.getCommentThread));

router.post("/", authorize("buyer"), asyncHandler(CommentController.createComment));
router.delete("/:id", authorize("buyer"), asyncHandler(CommentController.deleteComment));

export default router;
