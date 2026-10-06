import { reasonPhrases } from "#/constants/reasonPhrases.js";
import { statusCodes } from "#/constants/statusCodes.js";
import {
  createApiResponse,
  type ApiResponse,
  type PaginationMetadata,
} from "#/core/api.response.js";
import { getRequestId } from "#/helpers/request.context.js";
import type { Response } from "express";

interface SuccessPayload<T> {
  message?: string;
  statusCode?: number;
  items: T;
  pagination?: PaginationMetadata;
}

class SuccessResponse {
  static send<T>(
    res: Response,
    {
      message = reasonPhrases.OK,
      statusCode = statusCodes.OK,
      items,
      pagination,
    }: SuccessPayload<T>,
  ): Response<ApiResponse<T>> {
    const response = createApiResponse({
      statusCode,
      message: message || reasonPhrases.OK,
      items,
      pagination,
      requestId: getRequestId(),
    });

    return res.status(statusCode).json(response) as Response<ApiResponse<T>>;
  }

  static ok<T>(
    res: Response,
    payload: Omit<SuccessPayload<T>, "statusCode">,
  ): Response<ApiResponse<T>> {
    return SuccessResponse.send(res, {
      ...payload,
      statusCode: statusCodes.OK,
    });
  }

  static created<T>(
    res: Response,
    payload: Omit<SuccessPayload<T>, "statusCode">,
  ): Response<ApiResponse<T>> {
    return SuccessResponse.send(res, {
      ...payload,
      statusCode: statusCodes.CREATED,
    });
  }
}

export { SuccessResponse };
export type { SuccessPayload };
