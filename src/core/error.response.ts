"use strict";

import { reasonPhrases } from "#/common/constants/reasonPhrases.js";
import { statusCodes } from "#/common/constants/statusCodes.js";

class ErrorResponse extends Error {
  /**
   * isOperational = true  -> lỗi nghiệp vụ dự đoán trước được (sai input, trùng email,
   *                          hết quyền...).
   * isOperational = false -> lỗi hệ thống/bug không lường trước (DB down, null pointer...).
   *                          Phải log đầy đủ stack trace ở mức "error" để điều tra,
   */
  public isOperational: boolean;
  public cause?: unknown;

  constructor(
    message: string,
    public status: number,
    options?: { isOperational?: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.isOperational = options?.isOperational ?? true;
    this.cause = options?.cause;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ConflictRequestError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.CONFLICT,
    statusCode: number = statusCodes.CONFLICT,
  ) {
    super(message, statusCode);
  }
}

class BadRequestError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.BAD_REQUEST,
    statusCode: number = statusCodes.BAD_REQUEST,
  ) {
    super(message, statusCode);
  }
}

class AuthFailureError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.UNAUTHORIZED,
    statusCode: number = statusCodes.UNAUTHORIZED,
  ) {
    super(message, statusCode);
  }
}

class ForbiddenError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.FORBIDDEN,
    statusCode: number = statusCodes.FORBIDDEN,
  ) {
    super(message, statusCode);
  }
}

class NotFoundError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.NOT_FOUND,
    statusCode: number = statusCodes.NOT_FOUND,
  ) {
    super(message, statusCode);
  }
}

class InternalServerError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.INTERNAL_SERVER_ERROR,
    statusCode: number = statusCodes.INTERNAL_SERVER_ERROR,
    cause?: unknown,
  ) {
    // 500 mặc định coi là lỗi hệ thống (isOperational: false)
    super(message, statusCode, { isOperational: false, cause });
  }
}

export {
  ErrorResponse,
  ConflictRequestError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  InternalServerError,
  AuthFailureError,
};
