"use strict";

import mongoose from "mongoose";

/**
 * Per-account read state for pulled broadcasts. Rows exist only for accounts that read something,
 * so storage grows with activity, not with the number of accounts.
 */

const notificationStateSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, unique: true },
    // Every broadcast published at or before this instant counts as read ("mark all as read").
    broadcast_seen_at: { type: Date, default: null },
  },
  { timestamps: true, collection: "notification_states" },
);

const broadcastReadSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    broadcast: { type: mongoose.Schema.Types.ObjectId, ref: "BroadcastNotification", required: true },
  },
  { timestamps: true, collection: "broadcast_reads" },
);

// One read receipt per account and broadcast; marking twice is a no-op upsert.
broadcastReadSchema.index({ account: 1, broadcast: 1 }, { unique: true });

export type NotificationState = mongoose.InferSchemaType<typeof notificationStateSchema>;
export const NotificationStateModel = mongoose.model("NotificationState", notificationStateSchema);
export const BroadcastReadModel = mongoose.model("BroadcastRead", broadcastReadSchema);
