export interface ErrorResponseMessage {
  message: string;
  property?: string;
  index?: number;
  value?: string | number;
  redirectTo?: Partial<{ name: string; path: string; query: Record<string, string>; params: Record<string, string> }>;
}

export interface ErrorResponse {
  errorCode: number;
  errorData?: Record<string, any>;
  errorMessage: ErrorResponseMessage[];
}
