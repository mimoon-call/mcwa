import type { BaseResponse } from '@services/http/types';
import type { ReactNode } from 'react';

export type Option<T, E = Record<never, never>> = E & {
  title: string | ReactNode;
  value: T;
};

export type Options<T, E = Record<never, never>> = Option<T, E>[];

export type OptionsResponse<T, E = Record<never, never>> = BaseResponse<{ options: Option<T, E>[] }>;
