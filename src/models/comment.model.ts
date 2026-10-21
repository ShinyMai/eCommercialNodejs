"use strict";

import mongoose from "mongoose";

const DOCUMENT_NAME = "Comment";
const COLLECTION_NAME = "comments";

const commentSchema = new mongoose.Schema(
  {
    comment_account: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    comment_product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    comment_content: { type: String, required: true, trim: true },
    comment_left: { type: Number, default: 0 },
    comment_right: { type: Number, default: 0 },
    comment_parent: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null },
    is_deleted: { type: Boolean, default: false },
  },
  {
    collection: COLLECTION_NAME,
    timestamps: true,
  },
);

// Every tree query filters by product, then by a left/right range.
commentSchema.index({ comment_product: 1, comment_left: 1, comment_right: 1 });
// "Load more replies" pages through the direct children of one comment.
commentSchema.index({ comment_parent: 1, comment_left: 1 });

export type Comment = mongoose.InferSchemaType<typeof commentSchema>;
export const CommentModel = mongoose.model(DOCUMENT_NAME, commentSchema);
