"use strict";

import type { Request, Response } from "express";
import { SuccessResponse } from "#/core/success.response.js";
import type { AuthenticatedRequest } from "#/middlewares/authentication.middleware.js";
import CommentService from "#/services/comment.service.js";
import { getPagination } from "#/utils/index.js";

class CommentController {
  static async createComment(req: AuthenticatedRequest<unknown>, res: Response) {
    return SuccessResponse.created(res, {
      message: "Comment created successfully",
      items: await CommentService.createComment(req.body, req.auth.accountId),
    });
  }

  static async deleteComment(req: AuthenticatedRequest, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Comment deleted successfully",
      items: await CommentService.deleteComment(String(req.params.id), req.auth),
    });
  }

  static async listProductComments(req: Request, res: Response) {
    const { limit, page, skip } = getPagination(req.query);
    const { comments, total, totalComments } = await CommentService.getCommentsByProduct(String(req.params.productId), {
      limit,
      skip,
    });
    return SuccessResponse.ok(res, {
      message: "Comments retrieved successfully",
      items: comments,
      pagination: { page, limit, total },
      summary: { total_comments: totalComments },
    });
  }

  static async listChildComments(req: Request, res: Response) {
    const { limit, page, skip } = getPagination(req.query);
    const { comments, total } = await CommentService.getChildComments(String(req.params.id), { limit, skip });
    return SuccessResponse.ok(res, {
      message: "Replies retrieved successfully",
      items: comments,
      pagination: { page, limit, total },
    });
  }

  static async getCommentThread(req: Request, res: Response) {
    return SuccessResponse.ok(res, {
      message: "Comment thread retrieved successfully",
      items: await CommentService.getCommentThread(String(req.params.id)),
    });
  }
}

export default CommentController;
