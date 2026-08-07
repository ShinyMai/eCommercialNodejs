"use strict";

import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  requestId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  context: RequestContext,
  callback: () => T,
): T => {
  return asyncLocalStorage.run(context, callback);
};

export const getRequestId = (): string | undefined => {
  return asyncLocalStorage.getStore()?.requestId;
};

export default asyncLocalStorage;
