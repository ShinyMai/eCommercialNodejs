"use strict";
import keyTokenModel from "@/models/keyToken.model.js";
import log from "@/helpers/logger.js";
import { Types } from "mongoose";

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

  static findByUserId = async (userId: string) => {
    return await keyTokenModel
      .findOne({ user: new Types.ObjectId(userId) })
      .lean();
  };
}
