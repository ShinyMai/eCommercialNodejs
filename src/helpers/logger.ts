import logger from "#/configs/logger.config.js";
import { getRequestId } from "#/helpers/request.context.js";
import type { RuntimeValue } from "#/types/value.types.js";

type LogMeta = Record<string, RuntimeValue>;

export const toError = <T>(error: T): Error =>
  error instanceof Error ? error : new Error(String(error));

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
   * - context: nơi xảy ra lỗi, ví dụ "AuthService.signup"
   * - error: error gốc (giữ nguyên stack trace thật, không bị "nuốt")
   * - meta: dữ liệu liên quan (KHÔNG log password, token, secret...)
   */
  error: <T>(context: string, error: T, meta?: LogMeta) => {
    const err = toError(error);
    logger.error(`[${context}] ${err.message}`, {
      ...withRequestId(meta),
      stack: err.stack,
      name: err.name,
    });
  },
};

export default log;
