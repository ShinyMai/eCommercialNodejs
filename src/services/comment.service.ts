"use strict";

import type { ClientSession } from "mongoose";
import { hasMinimumRole, type AccountRole } from "#/auth/roles.js";
import { ForbiddenError, NotFoundError } from "#/core/error.response.js";
import {
  findActiveComment,
  countChildComments,
  countProductComments,
  countRootComments,
  deleteCommentsInRange,
  findActiveCommentById,
  findChildComments,
  findCommentsInRange,
  findMaxRight,
  findRootComments,
  insertComment,
  shiftPositionsFrom,
  type CommentPosition,
} from "#/repositories/comment.repo.js";
import NotificationService from "#/services/notification.service.js";
import { runInTransaction } from "#/utils/mongo.js";
import { validateIdString } from "#/utils/validation.js";
import { validateCreateCommentPayload, type CommentPayload } from "#/validators/comment.validator.js";

type CommentNode<T> = T & { replies: CommentNode<T>[] };

/** Also returns the parent's author so the caller can notify them about the reply. */
const resolveLeftPosition = async (
  payload: CommentPayload,
  session: ClientSession,
): Promise<{ left: number; parentAuthor: string | null }> => {
  if (!payload.comment_parent) {
    return { left: (await findMaxRight(payload.comment_product, session)) + 1, parentAuthor: null };
  }

  const parent = await findActiveComment(payload.comment_parent, payload.comment_product, session);
  if (!parent) throw new NotFoundError("Parent comment not found");

  await shiftPositionsFrom(payload.comment_product, parent.comment_right, 2, session);
  return { left: parent.comment_right, parentAuthor: String(parent.comment_account) };
};

/** Counts the number of descendants of a comment. */
const countDescendants = ({ comment_left, comment_right }: CommentPosition) => (comment_right - comment_left - 1) / 2;

const withReplyCount = <T extends CommentPosition>(comment: T) => ({
  ...comment,
  reply_count: countDescendants(comment),
});

/**
 * Rebuilds the tree from comments sorted by `left` (pre-order). The stack holds the current ancestor chain:
 * an ancestor whose `right` is before the next comment's `left` has no more children and is popped.
 * A soft-deleted comment is absent, so its replies attach to the nearest remaining ancestor.
 */
const buildTree = <T extends CommentPosition>(sorted: T[]): CommentNode<T> | null => {
  const stack: CommentNode<T>[] = [];
  let root: CommentNode<T> | null = null;

  for (const comment of sorted) {
    const node: CommentNode<T> = { ...comment, replies: [] };
    while (stack.length && stack[stack.length - 1].comment_right < node.comment_left) stack.pop();

    if (stack.length) stack[stack.length - 1].replies.push(node);
    else root ??= node;
    stack.push(node);
  }
  return root;
};

class CommentService {
  static async createComment(value: unknown, authenticatedAccountId: string) {
    const payload = validateCreateCommentPayload(value, authenticatedAccountId);

    const { comment, parentAuthor } = await runInTransaction(async (session) => {
      const { left, parentAuthor } = await resolveLeftPosition(payload, session);
      const comment = await insertComment({ ...payload, comment_left: left, comment_right: left + 1 }, session);
      return { comment, parentAuthor };
    });

    // Nobody is notified about replying to their own comment.
    if (parentAuthor && parentAuthor !== payload.comment_account) {
      await NotificationService.notify([
        {
          type: "comment_reply",
          to: parentAuthor,
          sender: payload.comment_account,
          data: {
            productId: payload.comment_product,
            commentId: String(comment._id),
            parentCommentId: payload.comment_parent,
          },
        },
      ]);
    }
    return comment;
  }

  static async deleteComment(commentId: string, auth: { accountId: string; role: AccountRole }) {
    const id = validateIdString(commentId, "commentId");

    return runInTransaction(async (session) => {
      const comment = await findActiveCommentById(id, session);
      if (!comment) throw new NotFoundError("Comment not found");
      if (String(comment.comment_account) !== auth.accountId && !hasMinimumRole(auth.role, "admin")) {
        throw new ForbiddenError("You can only delete your own comments");
      }

      const productId = String(comment.comment_product);
      const { comment_left: left, comment_right: right } = comment;
      const deletedCount = await deleteCommentsInRange(productId, left, right, session);
      // Close the gap: everything after the subtree moves back by its width.
      await shiftPositionsFrom(productId, right + 1, -(right - left + 1), session);
      return { deleted_count: deletedCount };
    });
  }

  static async getCommentsByProduct(productId: string, { limit, skip }: { limit: number; skip: number }) {
    const id = validateIdString(productId, "productId");
    const [roots, total, totalComments] = await Promise.all([
      findRootComments(id, limit, skip),
      countRootComments(id),
      countProductComments(id),
    ]);
    return { comments: roots.map(withReplyCount), total, totalComments };
  }

  static async getChildComments(parentId: string, { limit, skip }: { limit: number; skip: number }) {
    const parent = await findActiveCommentById(validateIdString(parentId, "commentId"));
    if (!parent) throw new NotFoundError("Comment not found");

    const id = String(parent._id);
    const [children, total] = await Promise.all([findChildComments(id, limit, skip), countChildComments(id)]);
    return { comments: children.map(withReplyCount), total };
  }

  static async getCommentThread(commentId: string) {
    const root = await findActiveCommentById(validateIdString(commentId, "commentId"));
    if (!root) throw new NotFoundError("Comment not found");

    const comments = await findCommentsInRange(String(root.comment_product), root.comment_left, root.comment_right);
    return buildTree(comments);
  }
}

export default CommentService;
