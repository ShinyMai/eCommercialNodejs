"use strict";

import keyTokenModel from "#/models/keyToken.model.js";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { AuthFailureError } from "#/core/error.response.js";
import { createTokenPair } from "#/auth/token.js";

interface CreateKeyTokenPayload {
  user: { id: string };
  publicKey: string;
  privateKey: string;
  refreshToken: string;
}

export default class KeyTokenService {
  static createKeyToken = ({
    user,
    publicKey,
    privateKey,
    refreshToken,
  }: CreateKeyTokenPayload) =>
    keyTokenModel.findOneAndUpdate(
      { user: user.id },
      { publicKey, privateKey, refreshTokenUsed: [], refreshToken },
      { new: true, upsert: true, runValidators: true },
    );

  static refreshToken = async (refreshToken: string) => {
    if (!refreshToken) {
      throw new AuthFailureError("Invalid request: Missing refresh token");
    }

    const usedTokenOwner = await keyTokenModel
      .findOne({ refreshTokenUsed: refreshToken })
      .lean();
    if (usedTokenOwner) {
      await keyTokenModel.deleteOne({ _id: usedTokenOwner._id });
      throw new AuthFailureError(
        "Invalid request: Refresh token has already been used",
      );
    }

    const keyStore = await keyTokenModel.findOne({ refreshToken }).lean();
    if (!keyStore) {
      throw new AuthFailureError("Invalid request: Invalid refresh token");
    }

    let decoded: { userId: string };
    try {
      decoded = jwt.verify(refreshToken, keyStore.publicKey, {
        algorithms: ["RS256"],
      }) as { userId: string };
    } catch {
      throw new AuthFailureError("Invalid or expired refresh token");
    }

    if (String(keyStore.user) !== String(decoded.userId)) {
      throw new AuthFailureError("Invalid request: User ID mismatch");
    }

    const newToken = createTokenPair(
      { userId: keyStore.user },
      keyStore.publicKey,
      keyStore.privateKey,
    );
    const rotated = await keyTokenModel.findOneAndUpdate(
      { _id: keyStore._id, refreshToken },
      {
        $push: { refreshTokenUsed: refreshToken },
        $set: { refreshToken: newToken.refreshToken },
      },
    );
    if (!rotated) {
      throw new AuthFailureError("Refresh token has already been rotated");
    }

    return newToken;
  };

  static findByUserId = (userId: string) => {
    if (!Types.ObjectId.isValid(userId)) return null;
    return keyTokenModel.findOne({ user: new Types.ObjectId(userId) }).lean();
  };

  static removeKeyById = (id: Types.ObjectId | string) =>
    keyTokenModel.deleteOne({ _id: id });
}
