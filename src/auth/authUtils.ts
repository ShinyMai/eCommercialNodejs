"use strict";

import jwt from "jsonwebtoken";

const createTokenPair = (
  payload: any,
  publicKey: string,
  privateKey: string
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

export { createTokenPair };
