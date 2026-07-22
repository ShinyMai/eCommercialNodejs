"use strict";

import { reasonPhrases } from "@/common/constants/reasonPhrases.js";
import { statusCodes } from "@/common/constants/statusCodes.js";

class ErrorResponse extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.status = status;
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
  ) {
    super(message, statusCode);
  }
}

export {
  ConflictRequestError,
  BadRequestError,
  NotFoundError,
  InternalServerError,
};
