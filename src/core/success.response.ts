"use strict";

import { reasonPhrases } from "@/common/constants/reasonPhrases.js";
import { statusCodes } from "@/common/constants/statusCodes.js";
import type { Response } from "express";

class SuccessResponse {
  constructor(
    public message: string,
    public statusCode: number = statusCodes.OK,
    public reasonStatusCode = reasonPhrases.OK,
    public metadata: object = {},
  ) {
    this.message = !message ? reasonPhrases.OK : message;
    this.statusCode = statusCode;
    this.reasonStatusCode = reasonStatusCode;
    this.metadata = metadata;
  }

  send(res: Response, header = {}) {
    return res.status(this.statusCode).json(this);
  }
}

class OK extends SuccessResponse {
  constructor({ message, metadata }: { message: string; metadata: object }) {
    super(message, statusCodes.OK, reasonPhrases.OK, metadata);
  }
}

class Created extends SuccessResponse {
  constructor({
    message,
    statusCode = statusCodes.CREATED,
    reasonStatusCode = reasonPhrases.CREATED,
    metadata,
  }: {
    message: string;
    statusCode?: number;
    reasonStatusCode?: string;
    metadata: object;
  }) {
    super(message, statusCode, reasonStatusCode, metadata);
  }
}

export { OK, Created };
