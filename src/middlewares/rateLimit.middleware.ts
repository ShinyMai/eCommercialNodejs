import { TooManyRequestsError } from "#/core/error.response.js";
import type { NextFunction, Request, RequestHandler, Response } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export const createRateLimiter = ({
  windowMs,
  max,
  message,
  keyGenerator = (req) => req.ip ?? req.socket.remoteAddress ?? "unknown",
}: RateLimitOptions): RequestHandler => {
  const entries = new Map<string, RateLimitEntry>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyGenerator(req);
    const current = entries.get(key);
    const entry = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };

    entries.set(key, entry);
    if (entries.size > 10_000) {
      for (const [candidateKey, candidate] of entries) {
        if (candidate.resetAt <= now) entries.delete(candidateKey);
      }
      while (entries.size > 10_000) {
        const oldestKey = entries.keys().next().value as string | undefined;
        if (!oldestKey) break;
        entries.delete(oldestKey);
      }
    }

    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", Math.max(max - entry.count, 0));
    res.setHeader("RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return next(new TooManyRequestsError(message));
    }
    return next();
  };
};
