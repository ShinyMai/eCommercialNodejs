"use strict";

import winston from "winston";
import path from "path";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const isProd = process.env.NODE_ENV === "prod";

// Format hiển thị log ở console
const consoleFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, requestId, stack, ...meta }) => {
    const ctx = requestId ? `[reqId:${requestId}]` : "";
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    const base = `${timestamp} ${level} ${ctx} ${message}${metaStr}`;
    return stack ? `${base}\n${stack}` : base;
  }),
);

// Format lưu file: JSON để sau này dễ parse / đưa vào ELK, Grafana Loki...
const fileFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: isProd ? "info" : "debug",
  defaultMeta: { service: "ecommerce-be" },
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: path.join("logs", "error.log"),
      level: "error",
      format: fileFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join("logs", "combined.log"),
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  exitOnError: false,
});

// Stream để morgan ghi log HTTP request vào cùng pipeline với winston
export const morganStream = {
  write: (message: string) => logger.info(message.trim()),
};

export default logger;
export { logger };
