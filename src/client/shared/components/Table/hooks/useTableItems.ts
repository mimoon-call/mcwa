// src/client/shared/components/Table/hooks/useTableItems.ts
import type { TableProps } from '../Table.type.ts';
import { useEffect, useRef, useState } from 'react';
import { sortElementArray } from '../helpers';

export const useTableItems = (props: TableProps, tableRef: ReturnType<typeof useRef<HTMLDivElement | null>>, defaultPageSize?: number) => {
  const [items, setItems] = useState<TableProps['items']>(props.items || []);
  const pageSize = props.pageSize || defaultPageSize;
  const totalPages = props.totalPages || (pageSize ? Math.ceil((props.items || []).length / pageSize) : 1);

  useEffect(() => {
    const sortPage = props.pageSort;
    const isServedResult = props.totalPages !== undefined;
    tableRef.current?.scrollTo({ top: 0, behavior: 'instant' });

    const items = (() => {
      if (sortPage && props.onSort && !isServedResult) {
        return sortElementArray(props.items, sortPage);
      }

      return props.items || [];
    })();

    // If no page size is set or total pages is 1, show all items
    if (!pageSize || totalPages === 1 || isServedResult) {
      setItems(items);
    } else {
      const start = (props.pageIndex || 0) * pageSize;
      const end = start + pageSize;

      setItems(items?.slice(start, end) || []);
    }
  }, [props.items, props.pageSort, props.pageIndex, props.pageSize, props.totalPages]);

  return { items, pageSize, totalPages };
};
