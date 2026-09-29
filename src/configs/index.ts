"use strict";

import dotenv from "dotenv";

dotenv.config({ quiet: true });

const environment = process.env.NODE_ENV?.toLowerCase() ?? "development";
const isProduction = environment === "production";

const readString = (name: string, fallback: string): string => {
  const value = process.env[name]?.trim();
  return value || fallback;
};

const readNumber = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
};

const readBoolean = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["true", "1", "yes"].includes(raw)) return true;
  if (["false", "0", "no"].includes(raw)) return false;
  throw new Error(`${name} must be true or false`);
};

const requireProductionSecret = (
  name: string,
  fallback: string,
  minimumLength = 32,
): string => {
  const configuredValue = process.env[name]?.trim();
  if (isProduction && (!configuredValue || configuredValue.length < minimumLength)) {
    throw new Error(`${name} must contain at least ${minimumLength} characters in production`);
  }
  return configuredValue || fallback;
};

const apiPrefix = readString("API_PREFIX", "/v1/api").replace(/\/$/, "");
const dbHost = readString("DB_HOST", "localhost");
const dbPort = readNumber("DB_PORT", 27017);
const dbName = readString(
  "DB_NAME",
  isProduction ? "ecommercePROD" : "ecommerceDEV",
);
const dbUser = readString("DB_USER", "root");
const dbPassword = readString("DB_PASSWORD", "root123");
const encodedCredentials = `${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}`;
const defaultMongoUri = `mongodb://${encodedCredentials}@${dbHost}:${dbPort}/${dbName}?authSource=admin`;
const configuredMongoUri = process.env.MONGODB_URI?.trim();
if (isProduction && !configuredMongoUri) {
  throw new Error("MONGODB_URI is required in production");
}

const config = Object.freeze({
  environment,
  isProduction,
  app: Object.freeze({
    port: readNumber("APP_PORT", 3000),
    apiPrefix,
    jsonLimit: readString("JSON_BODY_LIMIT", "1mb"),
    trustProxy: readBoolean("TRUST_PROXY", false),
  }),
  db: Object.freeze({
    uri: configuredMongoUri || defaultMongoUri,
    debug: readBoolean("DB_DEBUG", !isProduction),
    monitorIntervalMs: readNumber("DB_MONITOR_INTERVAL_MS", 5 * 60 * 1000),
  }),
  auth: Object.freeze({
    accessTokenTtl: readString("ACCESS_TOKEN_TTL", "15m"),
    accessTokenIssuer: readString("ACCESS_TOKEN_ISSUER", "ecommerce-api"),
    accessTokenAudience: readString("ACCESS_TOKEN_AUDIENCE", "ecommerce-client"),
    accessTokenSecret: requireProductionSecret(
      "ACCESS_TOKEN_SECRET",
      "development-only-access-token-secret-change-me",
    ),
    refreshCookieName: readString("REFRESH_COOKIE_NAME", "refreshToken"),
    refreshCookieMaxAgeMs: readNumber(
      "REFRESH_COOKIE_MAX_AGE_MS",
      7 * 24 * 60 * 60 * 1000,
    ),
    refreshCookiePath: `${apiPrefix}/auth`,
    refreshTokenHistoryLimit: readNumber("REFRESH_TOKEN_HISTORY_LIMIT", 50),
    bcryptSaltRounds: readNumber("BCRYPT_SALT_ROUNDS", 10),
    loginRateLimit: Object.freeze({
      windowMs: readNumber("AUTH_LOGIN_RATE_WINDOW_MS", 15 * 60 * 1000),
      max: readNumber("AUTH_LOGIN_RATE_MAX", 20),
    }),
    signupRateLimit: Object.freeze({
      windowMs: readNumber("AUTH_SIGNUP_RATE_WINDOW_MS", 60 * 60 * 1000),
      max: readNumber("AUTH_SIGNUP_RATE_MAX", 10),
    }),
    refreshRateLimit: Object.freeze({
      windowMs: readNumber("AUTH_REFRESH_RATE_WINDOW_MS", 15 * 60 * 1000),
      max: readNumber("AUTH_REFRESH_RATE_MAX", 60),
    }),
  }),
  logging: Object.freeze({
    level: readString("LOG_LEVEL", isProduction ? "info" : "debug"),
    directory: readString("LOG_DIRECTORY", "logs"),
    filesEnabled: readBoolean("LOG_FILES_ENABLED", isProduction),
  }),
});

export default config;
export type AppConfig = typeof config;
