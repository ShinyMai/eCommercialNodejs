"use strict";

import { reasonPhrases } from "@/common/constants/reasonPhrases.js";
import { statusCodes } from "@/common/constants/statusCodes.js";
import { getRequestId } from "@/helpers/request.context.js";
import type { Response } from "express";

class SuccessResponse {
  public status: "success" = "success";
  public code: number;
  public message: string;
  public metadata: object;
  public requestId?: string;
  public timestamp: string;

  constructor(
    message: string,
    statusCode: number = statusCodes.OK,
    metadata: object = {},
  ) {
    this.message = message || reasonPhrases.OK;
    this.code = statusCode;
    this.metadata = metadata;
    this.requestId = getRequestId();
    this.timestamp = new Date().toISOString();
  }

  send(res: Response) {
    return res.status(this.code).json(this);
  }
}

class OK extends SuccessResponse {
  constructor({ message, metadata }: { message: string; metadata?: object }) {
    super(message, statusCodes.OK, metadata);
  }
}

class Created extends SuccessResponse {
  constructor({
    message,
    statusCode = statusCodes.CREATED,
    metadata,
  }: {
    message: string;
    statusCode?: number;
    metadata?: object;
  }) {
    super(message, statusCode, metadata);
  }
}

export { SuccessResponse, OK, Created };
