export type Pagination = Partial<{
  pageIndex: number;
  pageSize: number;
  pageSort: Record<string, 1 | -1>;
  readonly totalPages: number;
}>;
