// src/client/shared/hooks/useAsyncFn.ts
import { useState, useCallback } from 'react';
import type { ErrorResponse } from '@services/http/types';

export type UseAsyncOptions<T> = Partial<{
  throwError: boolean;
  successCallback: (result?: T) => Promise<unknown> | unknown;
  errorCallback: (error: ErrorResponse, text?: string) => Promise<unknown> | unknown;
  resultState: ReturnType<typeof useState<T | null>>;
  loadingState: ReturnType<typeof useState<boolean>>;
  errorState: ReturnType<typeof useState<ErrorResponse | null>>;
}>;

export type UseAsyncFn<T> = { call: (...args: any[]) => Promise<T | undefined> | T; reset: () => void } & Partial<{
  results: T | null;
  loading: boolean;
  error: ErrorResponse | null;
}>;

export function useAsyncFn<T>(fn?: (...args: any[]) => Promise<T> | T, options: UseAsyncOptions<T> = {}): UseAsyncFn<T> {
  const {
    throwError,
    successCallback,
    errorCallback,
    resultState = useState<T | null>(null),
    loadingState = useState(false),
    errorState = useState<ErrorResponse | null>(null),
  } = options;

  const [results, setResults] = resultState;
  const [loading, setLoading] = loadingState;
  const [error, setError] = errorState;

  const call = useCallback(
    async function wrappedAsyncFn(...args: any[]): Promise<T | undefined> {
      setLoading(true);
      setError(null);
      setResults(null);

      try {
        const result = await fn?.(...args);
        setResults(result || null);
        await successCallback?.(result);

        return result;
      } catch (e) {
        const err = e as ErrorResponse;
        setError(err);

        // Extract error message properly from ErrorResponse or other errors
        let errorMessage: string | undefined;
        if (err?.errorMessage?.[0]?.message) {
          // Server error response (already serialized by server)
          errorMessage = err.errorMessage[0].message;
        } else if ('serializeErrors' in err && typeof err.serializeErrors === 'function') {
          // Fallback for ServerError instances (shouldn't happen with new interceptor)
          const serialized = err.serializeErrors();
          errorMessage = serialized.errorMessage?.[0]?.message;
        } else if ('message' in err && typeof err.message === 'string') {
          // Fallback to basic error message
          errorMessage = err.message;
        }

        await errorCallback?.(err, errorMessage);

        if (throwError) {
          throw err;
        }
      } finally {
        setTimeout(() => setLoading(false), fn ? 500 : 0);
      }
    },
    [fn, throwError, successCallback, errorCallback]
  );

  const reset = () => {
    setLoading(false);
    setError(null);
    setResults(null);
  };

  return { results, loading, error, call, reset };
}
