"use strict";

import winston from "winston";
import path from "path";
import config from "#/configs/index.js";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

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

const fileTransports = config.logging.filesEnabled
  ? [
      new winston.transports.File({
        filename: path.join(config.logging.directory, "error.log"),
        level: "error",
        format: fileFormat,
        maxsize: 5 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(config.logging.directory, "combined.log"),
        format: fileFormat,
        maxsize: 5 * 1024 * 1024,
        maxFiles: 5,
      }),
    ]
  : [];

const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: "ecommerce-be" },
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    ...fileTransports,
  ],
  exitOnError: false,
});

// Stream để morgan ghi log HTTP request vào cùng pipeline với winston
export const morganStream = {
  write: (message: string) => logger.info(message.trim()),
};

export default logger;
export { logger };
