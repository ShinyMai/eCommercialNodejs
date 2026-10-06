import { BadRequestError, ConflictRequestError, ErrorResponse } from "#/core/error.response.js";
import { isDuplicateKeyError } from "#/utils/mongo.js";
import type { RuntimeRecord, RuntimeValue } from "#/types/value.types.js";

interface MongoServerErrorLike extends Error {
  keyValue?: RuntimeRecord;
}

interface MongooseValidationErrorLike extends Error {
  errors: Record<string, { message: string }>;
}

interface MongooseCastErrorLike extends Error {
  path: string;
}

const isNamedError = (error: RuntimeValue, name: string): error is Error =>
  error instanceof Error && error.name === name;

const isMalformedJsonError = (error: RuntimeValue): boolean =>
  error instanceof SyntaxError && (error as SyntaxError & { status?: number }).status === 400;

/**
 * Quy đổi các lỗi hạ tầng (Mongoose/MongoDB driver, body parser) mà code KHÔNG chủ động throw
 * thành đúng ErrorResponse nghiệp vụ (operational).
 *
 * Chỉ nhận diện những lỗi có nguyên nhân RÕ RÀNG là do dữ liệu đầu vào của người dùng.
 * Lỗi không khớp pattern nào vẫn giữ nguyên là lỗi hệ thống, tránh "hạ cấp" một bug thật
 * thành lỗi operational rồi bỏ qua không điều tra.
 */
export const normalizeError = (error: RuntimeValue): ErrorResponse | RuntimeValue => {
  if (error instanceof ErrorResponse) return error;

  if (isDuplicateKeyError(error)) {
    const field = Object.keys((error as MongoServerErrorLike).keyValue ?? {})[0] ?? "field";
    return new ConflictRequestError(`${field} already exists`);
  }

  if (isNamedError(error, "ValidationError")) {
    const firstMessage = Object.values((error as MongooseValidationErrorLike).errors ?? {})[0]?.message;
    return new BadRequestError(firstMessage ?? "Invalid input data");
  }

  if (isNamedError(error, "CastError")) {
    return new BadRequestError(`Invalid value for field "${(error as MongooseCastErrorLike).path}"`);
  }

  if (isMalformedJsonError(error)) return new BadRequestError("Malformed JSON body");

  return error;
};
