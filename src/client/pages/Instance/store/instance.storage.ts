// src/client/pages/Instance/store/instance.storage.ts
import type { SearchInstanceReq } from './instance.types';
import { INSTANCE_SEARCH_FILTER } from '@client/pages/Instance/store/instance.constants';

type SavedFilter = Partial<Omit<SearchInstanceReq, 'page'>>;

export const saveInstanceFilter = (filter: SavedFilter): void => {
  if (typeof window === 'undefined') return;

  localStorage.setItem(INSTANCE_SEARCH_FILTER, JSON.stringify(filter));
};

export const loadInstanceFilter = (): SavedFilter => {
  if (typeof window === 'undefined') return {};

  try {
    const saved = localStorage.getItem(INSTANCE_SEARCH_FILTER);

    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const clearInstanceStorage = (): void => {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(INSTANCE_SEARCH_FILTER);
};
