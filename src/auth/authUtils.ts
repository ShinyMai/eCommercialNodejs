"use strict";

import { HEADER } from "#/common/constants/header.js";
import { AuthFailureError, NotFoundError } from "#/core/error.response.js";
import { asyncHandler } from "#/helpers/asyncHandler.js";
import KeyTokenService from "#/services/keyToken.service.js";
import type { TokenPayload } from "#/auth/token.js";
import { NextFunction, Response, Request } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

interface RequestWithKeyStore extends Request {
  keyStore?: {
    _id: Types.ObjectId;
    user: Types.ObjectId;
    publicKey: string;
    privateKey: string;
    refreshTokenUsed: string[];
    refreshToken: string;
  };
  userId?: string;
}

const authentication = asyncHandler(
  async (req: RequestWithKeyStore, _res: Response, next: NextFunction) => {
    const userId = req.headers[HEADER.CLIENT_ID]?.toString();
    if (!userId) {
      throw new AuthFailureError("Invalid request: Missing x-client-id header");
    }

    const keyStore = await KeyTokenService.findByUserId(userId);
    if (!keyStore) {
      throw new NotFoundError("Invalid request: Key store not found");
    }

    const authorization = req.headers[HEADER.AUTHORIZATION]?.toString();
    if (!authorization) {
      throw new AuthFailureError("Invalid request: Missing access token");
    }
    const accessToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : authorization;

    try {
      const decoded = jwt.verify(accessToken, keyStore.publicKey, {
        algorithms: ["RS256"],
      }) as TokenPayload;
      if (userId !== String(decoded.userId)) {
        throw new AuthFailureError("Invalid request: User ID mismatch");
      }
      req.keyStore = keyStore;
      req.userId = userId;
      return next();
    } catch (error) {
      if (error instanceof AuthFailureError) throw error;
      if (error instanceof Error && error.name === "TokenExpiredError") {
        throw new AuthFailureError("Access token expired");
      }
      throw new AuthFailureError("Invalid access token");
    }
  },
);

export { authentication };
export type { RequestWithKeyStore };
