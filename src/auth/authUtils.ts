"use strict";

import { HEADER } from "@/common/constants/header.js";
import { AuthFailureError, NotFoundError } from "@/core/error.response.js";
import { asyncHandler } from "@/helpers/asyncHandler.js";
import KeyTokenService from "@/services/keyToken.service.js";
import { NextFunction, Response, Request } from "express";
import jwt from "jsonwebtoken";

const createTokenPair = (
  payload: any,
  publicKey: string,
  privateKey: string,
) => {
  try {
    const accessToken = jwt.sign(payload, privateKey, {
      algorithm: "RS256",
      expiresIn: "2d",
    });

    const refreshToken = jwt.sign(payload, privateKey, {
      algorithm: "RS256",
      expiresIn: "7d",
    });

    jwt.verify(accessToken, publicKey);

    return {
      accessToken,
      refreshToken,
    };
  } catch (error) {
    throw error;
  }
};

const authentication = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    //1. Check userId missing?
    //2. Get accessToken, refreshToken
    //3. Verify accessToken
    //4. If accessToken expired => verify refreshToken => create new accessToken, refreshToken
    //5. If refreshToken expired => throw error

    const userId = req.headers[HEADER.CLIENT_ID]?.toString();
    if (!userId) {
      throw new AuthFailureError("Invalid request: Missing x-client-id header");
    }

    const keyStore = await KeyTokenService.findByUserId(userId);
    if (!keyStore) {
      throw new NotFoundError("Invalid request: Key store not found");
    }

    const accessToken = req.headers[HEADER.AUTHORIZATION]?.toString();
    if (!accessToken) {
      throw new AuthFailureError("Invalid request: Missing access token");
    }

    try {
      const decodeUser = jwt.verify(accessToken, keyStore.publicKey);
      if (userId !== (decodeUser as any).userId) {
        throw new AuthFailureError("Invalid request: User ID mismatch");
      }
      req.keyStore = keyStore;
      return next();
    } catch (error) {
      throw error;
    }
  },
);

export { createTokenPair };
