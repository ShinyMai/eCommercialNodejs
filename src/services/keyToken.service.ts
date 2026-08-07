"use strict";
import keyTokenModel from "@/models/keyToken.model.js";
import log from "@/helpers/logger.js";

interface CreateKeyTokenPayload {
  user: {
    id: string;
  };
  publicKey: string;
}

export default class KeyTokenService {
  static createKeyToken = async ({
    user,
    publicKey,
  }: CreateKeyTokenPayload): Promise<string | null> => {
    try {
      const tokens = await keyTokenModel.create({
        user: user.id,
        publicKey: publicKey,
      });

      return tokens ? tokens.publicKey : null;
    } catch (error) {
      log.error("KeyTokenService.createKeyToken", error, { userId: user.id });
      return null;
    }
  };
}
