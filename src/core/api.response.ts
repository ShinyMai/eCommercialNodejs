interface PaginationMetadata {
  page: number;
  limit: number;
  total?: number;
}

/** Extra counts about the whole result set, beyond the current page (e.g. total comments). */
type SummaryMetadata = Record<string, number>;

interface ApiMetadata<T> {
  items: T;
  pagination?: PaginationMetadata;
  summary?: SummaryMetadata;
}

interface ApiResponse<T> {
  statusCode: number;
  message: string;
  metadata: ApiMetadata<T>;
  requestId?: string;
  timestamp: string;
}

interface ApiResponsePayload<T> {
  statusCode: number;
  message: string;
  items: T;
  pagination?: PaginationMetadata;
  summary?: SummaryMetadata;
  requestId?: string;
}

type ApiErrorResponse = ApiResponse<null>;

const createApiResponse = <T>({
  statusCode,
  message,
  items,
  pagination,
  summary,
  requestId,
}: ApiResponsePayload<T>): ApiResponse<T> => ({
  statusCode,
  message,
  metadata: {
    items,
    ...(pagination ? { pagination } : {}),
    ...(summary ? { summary } : {}),
  },
  requestId,
  timestamp: new Date().toISOString(),
});

export { createApiResponse };
export type {
  ApiErrorResponse,
  ApiMetadata,
  ApiResponse,
  ApiResponsePayload,
  PaginationMetadata,
  SummaryMetadata,
};
