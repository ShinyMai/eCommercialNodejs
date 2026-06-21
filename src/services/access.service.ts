"use strict";

import shopModel from "@/models/shop.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import KeyTokenService from "./keyToken.service.js";
import { createTokenPair } from "@/auth/authUtils.js";

interface SignUpPayload {
  name: string;
  email: string;
  password: string;
}

const RoleShop = {
  SHOP: "shop",
  WRITE: "0",
  EDITOR: "1",
  ADMIN: "2",
};

export default class AccessService {
  static signup = async ({ name, email, password }: SignUpPayload) => {
    try {
      const holderShops = await shopModel.findOne({ email }).lean();
      if (holderShops) {
        return {
          code: "xxx",
          message: "Email already exists",
          status: "error",
        };
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const newShop = await shopModel.create({
        name,
        email,
        password: passwordHash,
        role: [RoleShop.SHOP],
      });

      if (newShop) {
        //created private key and public key
        const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
          modulusLength: 4096,
          publicKeyEncoding: {
            type: "spki",
            format: "pem",
          },

          privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
          },
        });

        console.log(privateKey, publicKey);

        const publicKeyString = await KeyTokenService.createKeyToken({
          user: { id: newShop._id.toString() },
          publicKey,
        });

        if (!publicKeyString) {
          return {
            code: "xxx",
            message: "Failed to create key token",
            status: "error",
          };
        }

        const tokens = await createTokenPair(
          {
            userId: newShop._id,
            email: newShop.email,
          },
          publicKey,
          privateKey
        );

        return {
          code: "20001",
          metadata: {
            shop: {
              _id: newShop._id,
              name: newShop.name,
              email: newShop.email,
            },
            tokens,
          },
        };
      }

      return {
        code: "20001",
        message: "Shop created successfully",
        status: "success",
        metadata: null,
      };
    } catch (error) {
      return {
        code: "xxx",
        message: (error as Error).message,
        status: "error",
      };
    }
  };
}
