// src/client/shared/hooks/useAsyncFn.ts
import { useState, useCallback } from 'react';
import type { ErrorResponse } from '@services/http/types';

export type UseAsyncOptions<T> = Partial<{
  throwError: boolean;
  successCallback: (result?: T) => Promise<void> | void;
  errorCallback: (error: ErrorResponse) => Promise<void> | void;
  resultState: ReturnType<typeof useState<T | null>>;
  loadingState: ReturnType<typeof useState<boolean>>;
  errorState: ReturnType<typeof useState<ErrorResponse | null>>;
}>;

export type UseAsyncFn<T> = { call: (...args: Array<any>) => Promise<T | undefined> | T; reset: () => void } & Partial<{
  results: T | null;
  loading: boolean;
  error: ErrorResponse | null;
}>;

export function useAsyncFn<T>(fn?: (...args: Array<any>) => Promise<T> | T, options: UseAsyncOptions<T> = {}): UseAsyncFn<T> {
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
    async function wrappedAsyncFn(...args: Array<unknown>): Promise<T | undefined> {
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
        await errorCallback?.(err);

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
