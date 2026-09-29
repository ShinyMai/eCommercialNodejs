"use strict";

import { createRefreshToken, hashToken } from "#/auth/token.js";
import config from "#/configs/index.js";
import { AuthFailureError } from "#/core/error.response.js";
import { AuthSessionModel } from "#/models/authSession.model.js";
import { Types } from "mongoose";

const activeSessionFilter = (now: Date) => ({
  revokedAt: null,
  expiresAt: { $gt: now },
});

export default class AuthSessionService {
  static async create(accountId: string) {
    const refreshToken = createRefreshToken();
    const now = new Date();
    const session = await AuthSessionModel.create({
      account: new Types.ObjectId(accountId),
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(now.getTime() + config.auth.refreshCookieMaxAgeMs),
      lastUsedAt: now,
    });
    return { refreshToken, session };
  }

  static async rotate(refreshToken: string) {
    if (typeof refreshToken !== "string" || !refreshToken) {
      throw new AuthFailureError("Missing refresh token");
    }

    const tokenHash = hashToken(refreshToken);
    const reusedSession = await AuthSessionModel.findOne({ usedTokenHashes: tokenHash })
      .select("+usedTokenHashes")
      .lean();
    if (reusedSession) {
      await AuthSessionModel.updateOne(
        { _id: reusedSession._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      throw new AuthFailureError("Refresh token reuse detected; session revoked");
    }

    const now = new Date();
    const currentSession = await AuthSessionModel.findOne({
      refreshTokenHash: tokenHash,
      ...activeSessionFilter(now),
    })
      .select("+refreshTokenHash +usedTokenHashes")
      .lean();
    if (!currentSession) {
      // A concurrent request may have rotated the token after the first reuse check.
      const concurrentlyRotated = await AuthSessionModel.findOne({
        usedTokenHashes: tokenHash,
      })
        .select("+usedTokenHashes")
        .lean();
      if (concurrentlyRotated) {
        await AuthSessionModel.updateOne(
          { _id: concurrentlyRotated._id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
        );
        throw new AuthFailureError("Refresh token reuse detected; session revoked");
      }
      throw new AuthFailureError("Invalid or expired refresh token");
    }

    const nextRefreshToken = createRefreshToken();
    const rotatedSession = await AuthSessionModel.findOneAndUpdate(
      {
        _id: currentSession._id,
        refreshTokenHash: tokenHash,
        ...activeSessionFilter(now),
      },
      {
        $set: {
          refreshTokenHash: hashToken(nextRefreshToken),
          lastUsedAt: now,
        },
        $push: {
          usedTokenHashes: {
            $each: [tokenHash],
            $slice: -config.auth.refreshTokenHistoryLimit,
          },
        },
      },
      { new: true },
    ).lean();

    if (!rotatedSession) {
      await AuthSessionModel.updateOne(
        { _id: currentSession._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      throw new AuthFailureError("Refresh token reuse detected; session revoked");
    }

    return { refreshToken: nextRefreshToken, session: rotatedSession };
  }

  static findActiveById(sessionId: string, accountId: string) {
    if (!Types.ObjectId.isValid(sessionId) || !Types.ObjectId.isValid(accountId)) return null;
    return AuthSessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      account: new Types.ObjectId(accountId),
      ...activeSessionFilter(new Date()),
    }).lean();
  }

  static revokeById(sessionId: string): Promise<unknown> {
    if (!Types.ObjectId.isValid(sessionId)) return Promise.resolve(null);
    return AuthSessionModel.updateOne(
      { _id: new Types.ObjectId(sessionId), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ).exec();
  }
}
