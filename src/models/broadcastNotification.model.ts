"use strict";

import mongoose from "mongoose";
import { ACCOUNT_ROLES } from "#/auth/roles.js";

const DOCUMENT_NAME = "BroadcastNotification";
const COLLECTION_NAME = "broadcast_notifications";

/** Notifications without a recipient are pulled (fan-out on read): one document shared by every account. */
export const BROADCAST_TYPES = ["promotion", "system"] as const;
export type BroadcastType = (typeof BROADCAST_TYPES)[number];

const broadcastNotificationSchema = new mongoose.Schema(
  {
    noti_type: { type: String, required: true, enum: BROADCAST_TYPES },
    noti_title: { type: String, required: true, trim: true },
    noti_content: { type: String, required: true, trim: true },
    noti_data: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Empty means every role.
    noti_audience: { type: [{ type: String, enum: ACCOUNT_ROLES }], default: [] },
    noti_sender: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    publish_at: { type: Date, required: true, default: Date.now },
    expire_at: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: COLLECTION_NAME,
    minimize: false,
  },
);

broadcastNotificationSchema.index({ publish_at: -1 });
broadcastNotificationSchema.index({ expire_at: 1 }, { expireAfterSeconds: 0 });

export type BroadcastNotification = mongoose.InferSchemaType<typeof broadcastNotificationSchema>;
export const BroadcastNotificationModel = mongoose.model(DOCUMENT_NAME, broadcastNotificationSchema);
