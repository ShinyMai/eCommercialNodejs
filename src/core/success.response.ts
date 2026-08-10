"use strict";

import { reasonPhrases } from "@/common/constants/reasonPhrases.js";
import { statusCodes } from "@/common/constants/statusCodes.js";
import { getRequestId } from "@/helpers/request.context.js";
import type { Response } from "express";

interface SuccessPayload {
  message: string;
  statusCode?: number;
  metadata?: object;
}

class SuccessResponse {
  static send(
    res: Response,
    { message, statusCode = statusCodes.OK, metadata = {} }: SuccessPayload,
  ) {
    return res.status(statusCode).json({
      status: "success",
      code: statusCode,
      message: message || reasonPhrases.OK,
      metadata,
      requestId: getRequestId(),
      timestamp: new Date().toISOString(),
    });
  }

  static ok(
    res: Response,
    { message, metadata }: Omit<SuccessPayload, "statusCode">,
  ) {
    return SuccessResponse.send(res, {
      message,
      metadata,
      statusCode: statusCodes.OK,
    });
  }

  static created(
    res: Response,
    { message, metadata }: Omit<SuccessPayload, "statusCode">,
  ) {
    return SuccessResponse.send(res, {
      message,
      metadata,
      statusCode: statusCodes.CREATED,
    });
  }
}

export { SuccessResponse };
