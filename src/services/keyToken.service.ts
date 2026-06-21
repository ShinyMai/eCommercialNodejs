"use strict";
import keyTokenModel from "@/models/keyToken.model.js";
import { KeyObject } from "crypto";

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
  }: CreateKeyTokenPayload) => {
    try {
      const tokens = await keyTokenModel.create({
        user: user.id,
        publicKey: publicKey,
      });

      return tokens ? tokens.publicKey : null;
    } catch (error) {
      return error;
    }
  };
}
