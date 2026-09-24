"use strict";

import dotenv from "dotenv";

dotenv.config({ quiet: true });

const rawEnvironment = process.env.NODE_ENV?.toLowerCase() ?? "development";
const environment =
  rawEnvironment === "prod"
    ? "production"
    : rawEnvironment === "dev"
      ? "development"
      : rawEnvironment;
const isProduction = environment === "production";
const legacyPrefix = isProduction ? "PROD" : "DEV";

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

const apiPrefix = readString("API_PREFIX", "/v1/api").replace(/\/$/, "");
const dbHost = readString(
  "DB_HOST",
  readString(`${legacyPrefix}_DB_HOST`, "localhost"),
);
const dbPort = readNumber(
  "DB_PORT",
  readNumber(`${legacyPrefix}_DB_PORT`, 27017),
);
const dbName = readString(
  "DB_NAME",
  readString(`${legacyPrefix}_DB_NAME`, isProduction ? "shopPROD" : "shopDEV"),
);
const dbUser = readString(
  "DB_USER",
  readString(`${legacyPrefix}_DB_USER`, "root"),
);
const dbPassword = readString(
  "DB_PASSWORD",
  readString(`${legacyPrefix}_DB_PASSWORD`, "root123"),
);
const encodedCredentials = `${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}`;
const defaultMongoUri = `mongodb://${encodedCredentials}@${dbHost}:${dbPort}/${dbName}?authSource=admin`;

const config = Object.freeze({
  environment,
  isProduction,
  app: Object.freeze({
    port: readNumber("APP_PORT", readNumber(`${legacyPrefix}_APP_PORT`, 3000)),
    apiPrefix,
    jsonLimit: readString("JSON_BODY_LIMIT", "1mb"),
    trustProxy: readBoolean("TRUST_PROXY", false),
  }),
  db: Object.freeze({
    uri: readString("MONGODB_URI", defaultMongoUri),
    name: dbName,
    debug: readBoolean("DB_DEBUG", !isProduction),
    monitorIntervalMs: readNumber("DB_MONITOR_INTERVAL_MS", 5 * 60 * 1000),
  }),
  auth: Object.freeze({
    accessTokenTtl: readString("ACCESS_TOKEN_TTL", "2d"),
    refreshTokenTtl: readString("REFRESH_TOKEN_TTL", "7d"),
    refreshCookieName: readString("REFRESH_COOKIE_NAME", "refreshToken"),
    refreshCookieMaxAgeMs: readNumber(
      "REFRESH_COOKIE_MAX_AGE_MS",
      7 * 24 * 60 * 60 * 1000,
    ),
    refreshCookiePath: `${apiPrefix}/auth`,
    bcryptSaltRounds: readNumber("BCRYPT_SALT_ROUNDS", 10),
    rsaModulusLength: readNumber("RSA_MODULUS_LENGTH", 2048),
    apiKeyBootstrapSecret: process.env.API_KEY_BOOTSTRAP_SECRET?.trim(),
  }),
  logging: Object.freeze({
    level: readString("LOG_LEVEL", isProduction ? "info" : "debug"),
    directory: readString("LOG_DIRECTORY", "logs"),
    filesEnabled: readBoolean("LOG_FILES_ENABLED", isProduction),
  }),
});

export default config;
export type AppConfig = typeof config;
