"use strict";

import {
  BadRequestError,
  ConflictRequestError,
  ErrorResponse,
} from "#/core/error.response.js";

interface MongoServerErrorLike extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

interface MongooseValidationErrorLike extends Error {
  name: "ValidationError";
  errors: Record<string, { message: string }>;
}

interface MongooseCastErrorLike extends Error {
  name: "CastError";
  path: string;
  value: unknown;
}

const isMongoDuplicateKeyError = (
  error: unknown,
): error is MongoServerErrorLike =>
  error instanceof Error &&
  error.name === "MongoServerError" &&
  (error as MongoServerErrorLike).code === 11000;

const isMongooseValidationError = (
  error: unknown,
): error is MongooseValidationErrorLike =>
  error instanceof Error && error.name === "ValidationError";

const isMongooseCastError = (error: unknown): error is MongooseCastErrorLike =>
  error instanceof Error && error.name === "CastError";

/**
 * Quy đổi các lỗi hạ tầng (Mongoose/MongoDB driver) mà code KHÔNG chủ động throw
 * thành đúng ErrorResponse nghiệp vụ (operational), thay vì để mặc định rơi vào
 * nhóm "lỗi hệ thống 500" chỉ vì chúng không phải instance của ErrorResponse.
 *
 * Chỉ nhận diện những lỗi có nguyên nhân RÕ RÀNG là do dữ liệu đầu vào của người dùng.
 * Bất kỳ lỗi nào không khớp pattern nào ở dưới vẫn giữ nguyên là lỗi hệ thống (an toàn,
 * tránh việc lỡ tay "hạ cấp" một bug thật thành lỗi operational rồi bỏ qua không điều tra).
 */
export const normalizeError = (error: unknown): ErrorResponse | unknown => {
  if (error instanceof ErrorResponse) {
    return error; // đã được phân loại chủ động từ trước -> giữ nguyên
  }

  if (isMongoDuplicateKeyError(error)) {
    const field = Object.keys(error.keyValue ?? {})[0] ?? "field";
    return new ConflictRequestError(`${field} already exists`);
  }

  if (isMongooseValidationError(error)) {
    const firstMessage = Object.values(error.errors)[0]?.message;
    return new BadRequestError(firstMessage ?? "Invalid input data");
  }

  if (isMongooseCastError(error)) {
    return new BadRequestError(`Invalid value for field "${error.path}"`);
  }

  if (
    error instanceof SyntaxError &&
    "status" in error &&
    (error as SyntaxError & { status?: number }).status === 400
  ) {
    return new BadRequestError("Malformed JSON body");
  }

  return error; // không nhận diện được -> để nguyên, error handler sẽ coi là lỗi hệ thống
};
