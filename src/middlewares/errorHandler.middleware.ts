import type { NextFunction, Request, Response } from "express";
import { createApiResponse, type ApiErrorResponse } from "#/core/api.response.js";
import { normalizeError } from "#/core/error.normalizer.js";
import { ErrorResponse, NotFoundError } from "#/core/error.response.js";
import log from "#/helpers/logger.js";
import type { RequestWithId } from "#/middlewares/requestId.middleware.js";
import type { RuntimeValue } from "#/types/value.types.js";

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler = (
  error: RuntimeValue,
  req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction,
) => {
  const requestId = (req as RequestWithId).requestId;
  const normalized = normalizeError(error);
  const isOperational = normalized instanceof ErrorResponse && normalized.isOperational;
  const statusCode = normalized instanceof ErrorResponse ? normalized.statusCode : 500;

  if (isOperational) {
    log.warn(`${req.method} ${req.originalUrl} -> ${statusCode}`, {
      requestId,
      message: normalized.message,
    });
  } else {
    log.error(`${req.method} ${req.originalUrl}`, error, { requestId });
  }

  return res.status(statusCode).json(
    createApiResponse({
      statusCode,
      message: isOperational ? normalized.message : "Internal Server Error",
      items: null,
      requestId,
    }),
  );
};
