"use strict";

import config from "#/configs/index.js";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

export interface TokenPayload {
  userId: Types.ObjectId | string;
  email?: string;
}

export const createTokenPair = (
  payload: TokenPayload,
  publicKey: string,
  privateKey: string,
) => {
  const accessToken = jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    expiresIn: config.auth.accessTokenTtl as jwt.SignOptions["expiresIn"],
  });
  const refreshToken = jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    expiresIn: config.auth.refreshTokenTtl as jwt.SignOptions["expiresIn"],
  });

  jwt.verify(accessToken, publicKey, { algorithms: ["RS256"] });
  return { accessToken, refreshToken };
};
