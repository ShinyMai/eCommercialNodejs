"use strict";

import mongoose, { InferSchemaType, Schema } from "mongoose";

const authSessionSchema = new Schema(
  {
    account: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true, select: false },
    usedTokenHashes: { type: [String], default: [], select: false },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { collection: "auth_sessions", timestamps: true },
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ account: 1, revokedAt: 1, expiresAt: 1 });

export type AuthSession = InferSchemaType<typeof authSessionSchema>;
export const AuthSessionModel = mongoose.model("AuthSession", authSessionSchema);
