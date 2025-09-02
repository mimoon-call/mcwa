import type { Pagination } from './pagination';

export type EntityList<T extends object, E = Record<never, never>> = E & {
  readonly data: T[];
  readonly totalItems: number;
  readonly hasMore: boolean;
} & Required<Omit<Pagination, 'pageSort'>> &
  Pick<Pagination, 'pageSort'>;
