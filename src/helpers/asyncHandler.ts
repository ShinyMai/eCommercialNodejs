import { NextFunction, Request, Response } from "express";

const asyncHandler = <TRequest extends Request>(
  fn: (
    req: TRequest,
    res: Response,
    next: NextFunction,
  ) => unknown | Promise<unknown>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(fn(req as TRequest, res, next)).catch(next);
  };
};

export { asyncHandler };
