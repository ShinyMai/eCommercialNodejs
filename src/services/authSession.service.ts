import { Types, type UpdateResult } from "mongoose";
import { createRefreshToken, hashToken } from "#/auth/token.js";
import config from "#/configs/index.js";
import { AuthFailureError } from "#/core/error.response.js";
import { AuthSessionModel } from "#/models/authSession.model.js";

const activeSessionFilter = (now: Date) => ({
  revokedAt: null,
  expiresAt: { $gt: now },
});

const revokeSession = (sessionId: Types.ObjectId) =>
  AuthSessionModel.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });

/**
 * A previously rotated token being presented again means it leaked: revoke the whole session.
 * Returns true when reuse was detected.
 */
const revokeIfReused = async (tokenHash: string): Promise<boolean> => {
  const reusedSession = await AuthSessionModel.findOne({ usedTokenHashes: tokenHash }).select("_id").lean();
  if (!reusedSession) return false;
  await revokeSession(reusedSession._id);
  return true;
};

const reuseDetected = () => new AuthFailureError("Refresh token reuse detected; session revoked");

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

  /** Exchanges a refresh token for a new one (rotation with reuse detection). */
  static async rotate(refreshToken: string) {
    if (typeof refreshToken !== "string" || !refreshToken) throw new AuthFailureError("Missing refresh token");

    const tokenHash = hashToken(refreshToken);
    if (await revokeIfReused(tokenHash)) throw reuseDetected();

    const now = new Date();
    const currentSession = await AuthSessionModel.findOne({ refreshTokenHash: tokenHash, ...activeSessionFilter(now) })
      .select("_id")
      .lean();
    if (!currentSession) {
      // A concurrent request may have rotated the token after the first reuse check.
      if (await revokeIfReused(tokenHash)) throw reuseDetected();
      throw new AuthFailureError("Invalid or expired refresh token");
    }

    const nextRefreshToken = createRefreshToken();
    const rotatedSession = await AuthSessionModel.findOneAndUpdate(
      { _id: currentSession._id, refreshTokenHash: tokenHash, ...activeSessionFilter(now) },
      {
        $set: { refreshTokenHash: hashToken(nextRefreshToken), lastUsedAt: now },
        $push: { usedTokenHashes: { $each: [tokenHash], $slice: -config.auth.refreshTokenHistoryLimit } },
      },
      { new: true },
    ).lean();

    if (!rotatedSession) {
      // Lost the race against another rotation of the same token.
      await revokeSession(currentSession._id);
      throw reuseDetected();
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

  static revokeById(sessionId: string): Promise<UpdateResult | null> {
    if (!Types.ObjectId.isValid(sessionId)) return Promise.resolve(null);
    return revokeSession(new Types.ObjectId(sessionId)).exec();
  }
}
