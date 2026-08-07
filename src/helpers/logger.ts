"use strict";

import logger from "@/configs/logger.config.js";
import { getRequestId } from "@/helpers/request.context.js";

type LogMeta = Record<string, unknown>;

const withRequestId = (meta: LogMeta = {}) => {
  const requestId = getRequestId();
  return requestId ? { requestId, ...meta } : meta;
};

const log = {
  debug: (message: string, meta?: LogMeta) =>
    logger.debug(message, withRequestId(meta)),

  info: (message: string, meta?: LogMeta) =>
    logger.info(message, withRequestId(meta)),

  warn: (message: string, meta?: LogMeta) =>
    logger.warn(message, withRequestId(meta)),

  /**
   * Log lỗi kèm đầy đủ ngữ cảnh để dễ truy vết:
   * - context: nơi xảy ra lỗi, ví dụ "AccessService.signup"
   * - error: error gốc (giữ nguyên stack trace thật, không bị "nuốt")
   * - meta: dữ liệu liên quan (KHÔNG log password, token, secret...)
   */
  error: (context: string, error: unknown, meta?: LogMeta) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`[${context}] ${err.message}`, {
      ...withRequestId(meta),
      stack: err.stack,
      name: err.name,
    });
  },
};

export default log;
