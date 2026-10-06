interface PaginationMetadata {
  page: number;
  limit: number;
  total?: number;
}

interface ApiMetadata<T> {
  items: T;
  pagination?: PaginationMetadata;
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
  requestId?: string;
}

type ApiErrorResponse = ApiResponse<null>;

const createApiResponse = <T>({
  statusCode,
  message,
  items,
  pagination,
  requestId,
}: ApiResponsePayload<T>): ApiResponse<T> => ({
  statusCode,
  message,
  metadata: {
    items,
    ...(pagination ? { pagination } : {}),
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
};
