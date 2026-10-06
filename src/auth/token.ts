import crypto from "node:crypto";
import config from "#/configs/index.js";
import { AuthFailureError } from "#/core/error.response.js";
import jwt, { type JwtPayload } from "jsonwebtoken";

const ACCESS_TOKEN_USE = "access" as const;

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  sid: string;
  tokenUse: typeof ACCESS_TOKEN_USE;
}

export const createAccessToken = ({
  accountId,
  sessionId,
}: {
  accountId: string;
  sessionId: string;
}): string =>
  jwt.sign(
    { sid: sessionId, tokenUse: ACCESS_TOKEN_USE },
    config.auth.accessTokenSecret,
    {
      algorithm: "HS256",
      audience: config.auth.accessTokenAudience,
      expiresIn: config.auth.accessTokenTtl as jwt.SignOptions["expiresIn"],
      issuer: config.auth.accessTokenIssuer,
      jwtid: crypto.randomUUID(),
      subject: accountId,
    },
  );

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, config.auth.accessTokenSecret, {
      algorithms: ["HS256"],
      audience: config.auth.accessTokenAudience,
      issuer: config.auth.accessTokenIssuer,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TokenExpiredError") {
      throw new AuthFailureError("Access token expired");
    }
    throw new AuthFailureError("Invalid access token");
  }

  if (
    typeof decoded === "string" ||
    decoded.tokenUse !== ACCESS_TOKEN_USE ||
    typeof decoded.sub !== "string" ||
    typeof decoded.sid !== "string"
  ) {
    throw new AuthFailureError("Invalid access token");
  }

  return decoded as AccessTokenPayload;
};

export const createRefreshToken = (): string =>
  crypto.randomBytes(64).toString("base64url");

export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token, "utf8").digest("hex");
