"use strict";

import mongoose from "mongoose";

const DOCUMENT_NAME = "Notification";
const COLLECTION_NAME = "notifications";

/** Personal notifications are pushed (fan-out on write): one document per recipient. */
export const NOTIFICATION_TYPES = [
  "order_placed",
  "order_cancelled",
  "order_expired",
  "shop_new_order",
  "comment_reply",
  "product_back_in_stock",
  "promotion",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const NOTIFICATION_TTL_SECONDS = 90 * 24 * 60 * 60;

const notificationSchema = new mongoose.Schema(
  {
    noti_type: { type: String, required: true, enum: NOTIFICATION_TYPES },
    noti_to: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    // System notifications (orders, stock) have no sender.
    noti_sender: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
    noti_title: { type: String, required: true, trim: true },
    noti_content: { type: String, required: true, trim: true },
    // Ids the client needs to navigate, e.g. { orderId } or { productId, commentId }.
    noti_data: { type: mongoose.Schema.Types.Mixed, default: {} },
    noti_read_at: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: COLLECTION_NAME,
    minimize: false,
  },
);

// The inbox pages through one recipient's notifications, newest first.
notificationSchema.index({ noti_to: 1, createdAt: -1 });
// Unread badge counts.
notificationSchema.index({ noti_to: 1, noti_read_at: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });

export type Notification = mongoose.InferSchemaType<typeof notificationSchema>;
export const NotificationModel = mongoose.model(DOCUMENT_NAME, notificationSchema);
