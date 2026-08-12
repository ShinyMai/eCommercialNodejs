"use strict";
import keyTokenModel from "@/models/keyToken.model.js";
import log from "@/helpers/logger.js";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { AuthFailureError } from "@/core/error.response.js";
import { createTokenPair } from "@/auth/authUtils.js";

interface CreateKeyTokenPayload {
  user: {
    id: string;
  };
  publicKey: string;
  privateKey: string;
  refreshToken: string;
}

export default class KeyTokenService {
  static createKeyToken = async ({
    user,
    publicKey,
    privateKey,
    refreshToken,
  }: CreateKeyTokenPayload): Promise<string | null> => {
    try {
      //lv0
      // const tokens = await keyTokenModel.create({
      //   user: user.id,
      //   publicKey: publicKey,
      //   privateKey: privateKey,
      // });

      const filter = { user: user.id };
      const update = {
        publicKey,
        privateKey,
        refreshTokenUsed: [],
        refreshToken,
      };
      const options = { new: true, upsert: true }; // upsert: create a new document if it doesn't exist
      const tokens = await keyTokenModel.findOneAndUpdate(
        filter,
        update,
        options,
      );

      return tokens ? tokens.publicKey : null;
    } catch (error) {
      log.error("KeyTokenService.createKeyToken", error, { userId: user.id });
      return null;
    }
  };

  static refreshToken = async (refreshToken: string) => {
    if (!refreshToken) {
      throw new AuthFailureError("Invalid request: Missing refresh token");
    }

    // Nếu refreshToken này đã từng được dùng để refresh trước đó
    // => nghi ngờ token bị đánh cắp và bị dùng lại, revoke toàn bộ keyStore của user này
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

    // Token được ký (sign) bằng privateKey (RS256) nên phải verify bằng publicKey tương ứng
    const decode = jwt.verify(refreshToken, keyStore.publicKey) as {
      userId: string;
    };
    if (String(keyStore.user) !== String(decode.userId)) {
      throw new AuthFailureError("Invalid request: User ID mismatch");
    }

    const newToken = await createTokenPair(
      {
        userId: keyStore.user,
      },
      keyStore.publicKey,
      keyStore.privateKey,
    );

    await keyTokenModel.findOneAndUpdate(
      { _id: keyStore._id },
      {
        $push: { refreshTokenUsed: refreshToken },
        refreshToken: newToken.refreshToken,
      },
    );

    return {
      accessToken: newToken.accessToken,
      refreshToken: newToken.refreshToken,
    };
  };

  static findByUserId = async (userId: string) => {
    return await keyTokenModel
      .findOne({ user: new Types.ObjectId(userId) })
      .lean();
  };

  static removeKeyById = async (id: Types.ObjectId | string) => {
    return await keyTokenModel.deleteOne({ _id: id });
  };
}
