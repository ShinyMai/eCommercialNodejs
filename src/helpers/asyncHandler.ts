import { NextFunction, Request, Response } from "express";

type HandlerResult = void | Response;

const asyncHandler = <TRequest extends Request>(
  fn: (
    req: TRequest,
    res: Response,
    next: NextFunction,
  ) => HandlerResult | Promise<HandlerResult>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(fn(req as TRequest, res, next)).catch(next);
  };
};

export { asyncHandler };
