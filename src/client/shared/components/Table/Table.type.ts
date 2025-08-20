// src/client/shared/components/Table/Table.type.ts
import type { CSSProperties, ReactNode } from 'react';
import type { ClassValue } from 'clsx';
import type { Pagination } from '@models';
import type { IconName } from '@components/Icon/Icon.type';
import { useTableBody } from '@components/Table/hooks';
import type { MenuItem } from '@components/Menu/Menu.type';

export type DefaultTableItem = any;

export type TableItemAction<T extends object = DefaultTableItem> = {
  label: string | ((item: T) => string);
  iconName: IconName | ((item: T) => IconName);
  loading?: boolean;
  className?: ClassValue;
  onClick: (item: T) => Promise<unknown> | unknown;
};

export type TableBodyProps = Pick<TableProps, 'headers' | 'items' | 'loading' | 'rowClickable' | 'onRowClick' | 'keyboardDisabled'>;

export type TableBodyItemProps<T extends object = DefaultTableItem> = { item: T; itemIndex: number } & Pick<
  ReturnType<typeof useTableBody>,
  'setRow' | 'setFocus'
> &
  Pick<TableBodyProps, 'rowClickable' | 'onRowClick' | 'headers'> &
  Pick<TableProps, 'keyboardDisabled'>;

export type TableHeaderProps = Pick<TableProps, 'headers' | 'draggable'> & {
  sort: Pagination['pageSort'] | undefined;
  onSort: TableProps['onSort'] | undefined;
  actions?: ReactNode;
};

export type TablePaginationProps = {
  onPageChange: ((index: number) => Promise<void> | void) | undefined;
} & Pick<TableProps, 'keyboardDisabled' | 'pageIndex' | 'totalPages'>;

export type TableHeader<T extends object = Record<never, never>> = {
  title: string | ReactNode;
  value: string;
  sortable?: boolean | Array<string>;
  searchable?: boolean;
  style?: CSSProperties;
  class?: ClassValue[];
  hidden?: boolean;
  valueFormatter?: (value?: any) => string | undefined;
  component?: (props: { item: T }) => ReactNode;
  colSpan?: number;
};

export type TableHeaders<T extends object = DefaultTableItem, E = Record<never, never>> = Array<TableHeader<T> & E>;

export type TableProps<T extends object = DefaultTableItem> = {
  headers: TableHeaders<T>;
  items: Array<T> | undefined;
  draggable?: boolean;
  customizable?: boolean;
  showGrid?: boolean;
  rowClickable?: boolean | ((item: T) => boolean);
  onRowClick?: (item: T) => Promise<void> | void;
  pageIndex?: Pagination['pageIndex'];
  pageSize?: Pagination['pageSize'];
  totalPages?: Pagination['totalPages'];
  onPageChange: ((index: number) => Promise<void> | void) | undefined;
  pageSort?: Pagination['pageSort'];
  onSort: ((sort: Pagination['pageSort']) => Promise<void> | void) | undefined;
  loading?: boolean;
  className?: ClassValue;
  keyboardDisabled?: boolean;
  emptyState?: ReactNode;
  previewCallback?: (item: T) => void | Promise<void>;
  updateCallback?: (item: T) => void | Promise<void>;
  deleteCallback?: (item: T) => void | Promise<void>;
  createCallback?: () => void | Promise<void>;
  exportCallback?: () => void | Promise<void>;
  customActions?: Array<TableItemAction<T>>;
  tableActions?: Array<MenuItem>;
};
