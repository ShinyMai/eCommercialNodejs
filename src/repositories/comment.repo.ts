import type { ClientSession } from "mongoose";
import { CommentModel } from "#/models/comment.model.js";
import { withSession } from "#/utils/mongo.js";
import type { CommentPayload } from "#/validators/comment.validator.js";

export type CommentPosition = { comment_left: number; comment_right: number };

const findActiveComment = (commentId: string, productId: string, session?: ClientSession) =>
  withSession(CommentModel.findOne({ _id: commentId, comment_product: productId, is_deleted: false }), session).exec();

const findActiveCommentById = (commentId: string, session?: ClientSession) =>
  withSession(CommentModel.findOne({ _id: commentId, is_deleted: false }), session)
    .lean()
    .exec();

/** Highest `right` in the product's comment forest, or 0 when it has no comments yet. */
const findMaxRight = async (productId: string, session?: ClientSession): Promise<number> => {
  const last = await withSession(
    CommentModel.findOne({ comment_product: productId }).select("comment_right").sort({ comment_right: -1 }).lean(),
    session,
  ).exec();
  return last?.comment_right ?? 0;
};

/**
 * Moves every left/right at or after `position` by `delta`: +2 opens a gap for a new comment,
 * a negative delta closes the gap left by a deleted subtree.
 */
const shiftPositionsFrom = async (productId: string, position: number, delta: number, session?: ClientSession) => {
  await CommentModel.updateMany(
    { comment_product: productId, comment_right: { $gte: position } },
    { $inc: { comment_right: delta } },
    { session },
  );
  await CommentModel.updateMany(
    { comment_product: productId, comment_left: { $gte: position } },
    { $inc: { comment_left: delta } },
    { session },
  );
};

/** Hard-deletes a comment together with every reply under it. */
const deleteCommentsInRange = async (productId: string, left: number, right: number, session?: ClientSession) => {
  const { deletedCount } = await CommentModel.deleteMany(
    { comment_product: productId, comment_left: { $gte: left }, comment_right: { $lte: right } },
    { session },
  );
  return deletedCount;
};

const insertComment = async (payload: CommentPayload & CommentPosition, session?: ClientSession) => {
  const [comment] = await CommentModel.create([payload], { session });
  return comment;
};

const rootFilter = (productId: string) => ({ comment_product: productId, comment_parent: null, is_deleted: false });
const childFilter = (parentId: string) => ({ comment_parent: parentId, is_deleted: false });

/** Top-level comments of a product, newest first (a later root always has a larger `left`). */
const findRootComments = (productId: string, limit: number, skip: number) =>
  CommentModel.find(rootFilter(productId))
    .sort({ comment_left: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();

/** Every comment inside [left, right] of a product, in tree (pre-order) order. */
const findCommentsInRange = (productId: string, left: number, right: number) =>
  CommentModel.find({
    comment_product: productId,
    comment_left: { $gte: left },
    comment_right: { $lte: right },
    is_deleted: false,
  })
    .sort({ comment_left: 1 })
    .lean()
    .exec();

/** Direct replies of a comment, oldest first (siblings are ordered by `left`). */
const findChildComments = (parentId: string, limit: number, skip: number) =>
  CommentModel.find(childFilter(parentId))
    .sort({ comment_left: 1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();

const countRootComments = (productId: string) => CommentModel.countDocuments(rootFilter(productId)).exec();

const countChildComments = (parentId: string) => CommentModel.countDocuments(childFilter(parentId)).exec();

/** Every comment of a product at any depth, roots and replies. */
const countProductComments = (productId: string) =>
  CommentModel.countDocuments({ comment_product: productId, is_deleted: false }).exec();

export {
  findActiveComment,
  findActiveCommentById,
  findMaxRight,
  shiftPositionsFrom,
  deleteCommentsInRange,
  insertComment,
  findRootComments,
  findChildComments,
  findCommentsInRange,
  countRootComments,
  countChildComments,
  countProductComments,
};
