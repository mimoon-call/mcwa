// src/client/shared/components/Table/Table.tsx
import type {
  TableHeaderProps,
  TableBodyProps,
  TableProps,
  DefaultTableItem,
  TablePaginationProps,
  TableBodyItemProps,
  TableItemAction,
} from '@components/Table/Table.type';
import type { IconName } from '@components/Icon/Icon.type';
import type { MenuItem } from '@components/Menu/Menu.type';
import React, { KeyboardEvent, MouseEvent, useRef } from 'react';
import Icon from '@components/Icon/Icon';
import { useTableBody, useTableHeaders, useTableItems, useTablePagination } from '@components/Table/hooks';
import styles from '@components/Table/Table.module.css';
import { useTranslation } from 'react-i18next';
import { useAsyncFn } from '@hooks/useAsyncFn';
import Spinner from '@components/Spinner/Spinner';
import { useTooltip } from '@hooks/useTooltip';
import { cn } from '@client/plugins';
import { Menu } from '@components/Menu/Menu';

const getHeadersWithActions = (props: Pick<TableProps, 'headers' | 'updateCallback' | 'deleteCallback' | 'previewCallback' | 'customActions'>) => {
  const actions: Array<TableItemAction> = [...(props.customActions || [])];

  if (props.previewCallback) {
    actions.push({ label: 'GENERAL.VIEW', onClick: props.previewCallback, iconName: 'svg:eye' });
  }

  if (props.updateCallback) {
    actions.push({ label: 'GENERAL.UPDATE', onClick: props.updateCallback, iconName: 'svg:edit' });
  }

  if (props.deleteCallback) {
    actions.push({ label: 'GENERAL.DELETE', onClick: props.deleteCallback, iconName: 'svg:trash', className: 'text-red-900' });
  }

  if (!actions.length) {
    return props.headers;
  }

  return [
    ...props.headers,
    {
      title: 'GENERAL.ACTIONS',
      value: '_actions',
      colSpan: 2,
      component: ({ item }: Pick<TableBodyItemProps, 'item'>) => <Actions item={item} actions={actions} />,
    },
  ];
};

const Header = ({ headers, draggable, sort, onSort, actions }: TableHeaderProps) => {
  const { t } = useTranslation();
  const { theadRef, colRefs, tableHeaders, onClick, onMouseOver, onMouseDown } = useTableHeaders({ headers, draggable, sort, onSort });

  return (
    <thead ref={theadRef} className="relative">
      <tr className={cn(styles.dataTableHeader)}>
        {tableHeaders.map((header, idx) => {
          const isSortable = !!(header.sortable && onSort);
          const headerClass = cn('flex justify-between items-center', isSortable && 'cursor-pointer', header.class);

          const sortIcon = ((): { name: IconName; className: string } => {
            const keys = Array.isArray(header.sortable) ? header.sortable : [header.value];
            const val = Object.entries(sort || {}).find(([k]) => keys.includes(k))?.[1];
            if (val === 1) {
              return { name: 'svg:chevron-vertical-up', className: 'text-primary' };
            }

            if (val === -1) {
              return { name: 'svg:chevron-vertical-down', className: 'text-primary' };
            }

            return { name: 'svg:chevron-vertical', className: 'text-slate-300' };
          })();

          const headerTitle =
            typeof header.title === 'string' ? (
              <div className="overflow-hidden whitespace-nowrap text-ellipsis flex-grow">{t(header.title)}</div>
            ) : (
              header.title
            );

          return header.hidden ? null : (
            <td
              key={idx}
              ref={(el) => {
                colRefs.current[idx] = el;
              }}
              style={header.style}
              draggable={draggable}
              onClick={() => onClick(header.value, header.sortable)}
              onMouseOver={onMouseOver(idx)}
              onMouseDown={onMouseDown}
            >
              <div className={cn('border-s p-1', headerClass)}>
                {headerTitle}
                {isSortable && (
                  <div className="ps-2">
                    <Icon size="1rem" {...sortIcon} />
                  </div>
                )}
              </div>
            </td>
          );
        })}

        {actions}
      </tr>
    </thead>
  );
};

const Item = ({ item, itemIndex, headers, keyboardDisabled, rowClickable, onRowClick, setRow, setFocus }: TableBodyItemProps) => {
  const isRowClickable = (typeof rowClickable === 'function' ? rowClickable(item) : rowClickable) && !!onRowClick;
  const notAllowed = !!onRowClick && !isRowClickable;

  const handleKeyDown = (ev: KeyboardEvent<HTMLTableRowElement>, item: DefaultTableItem) => {
    if (keyboardDisabled) {
      return;
    }

    if (ev.key === 'Enter') {
      ev.preventDefault();
      onRowClick?.(item);
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setFocus(itemIndex, 1);
    } else if (ev.key === 'ArrowUp') {
      if (itemIndex - 1 > 0) {
        ev.preventDefault();
      }

      setFocus(itemIndex, -1);
    }
  };

  const onClick = (ev: MouseEvent) => {
    if (isRowClickable && !(ev.target as HTMLElement).closest('[data-value="_actions"]')) {
      onRowClick?.(item);
    }
  };

  return (
    <tr
      ref={setRow(itemIndex)}
      className={cn(isRowClickable && styles['data-table--clickable'], notAllowed && styles['data-table--not-allowed'])}
      tabIndex={isRowClickable ? 0 : -1}
      onMouseOver={() => setFocus(itemIndex, 0)}
      onClick={onClick}
      onKeyDown={(e) => handleKeyDown(e, item)}
    >
      {headers.map((header, headerIndex) => {
        if (header.hidden) {
          return null;
        }

        const isLastHeader = headerIndex === headers.length - 1;
        const colSpan = header.colSpan || 1 + (isLastHeader ? 1 : 0);
        const columnClass = cn(styles.dataTableCell, header.class, `table-row-${itemIndex}-column-${headerIndex}`);

        if (header.component) {
          return (
            <td key={headerIndex} colSpan={colSpan} data-value={header.value} data-searchable={header.searchable}>
              <div className={cn('px-1 py-2', columnClass)} style={header.style}>
                <header.component item={item} />
              </div>
            </td>
          );
        }

        const value = item[header.value as keyof typeof item];

        if (React.isValidElement(value)) {
          return (
            <td key={headerIndex} className={columnClass} colSpan={colSpan} style={header.style} data-searchable={header.searchable}>
              {value}
            </td>
          );
        }

        const formattedValue = header.valueFormatter ? header.valueFormatter(item[value]) : value;

        return (
          <td key={headerIndex} className={columnClass} colSpan={colSpan} style={header.style} data-searchable={header.searchable}>
            {formattedValue}
          </td>
        );
      })}
    </tr>
  );
};

const Body = (props: TableBodyProps) => {
  if (!props.items?.length) {
    return null;
  }

  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const { setRow, setFocus } = useTableBody(props, tbodyRef);

  return (
    <tbody ref={tbodyRef}>
      {props.items?.map((item, itemIndex) => (
        <Item
          item={item}
          key={itemIndex}
          itemIndex={itemIndex}
          setRow={setRow}
          setFocus={setFocus}
          headers={props.headers}
          keyboardDisabled={props.keyboardDisabled}
          rowClickable={props.rowClickable}
          onRowClick={props.onRowClick}
        />
      ))}
    </tbody>
  );
};

const Pagination = (props: TablePaginationProps) => {
  const { pageNumMap, pageNumRef, pageIndex, totalPages, setItemRefs, onPageChange } = useTablePagination(props);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className={cn(styles['pagination'])}>
      <button disabled={pageIndex <= 0} onClick={() => onPageChange(pageIndex - 1)}>
        <Icon name="svg:chevron-left" size="1rem" />
      </button>

      <div ref={pageNumRef} className={cn(styles['pagination-items'])}>
        {pageNumMap.map((pageNumber, i) => (
          <div className={cn(pageNumber === pageIndex + 1 && styles['pagination-item--active'])} key={pageNumber} role="button">
            <div>
              <span ref={setItemRefs(i)} onClick={() => onPageChange(pageNumber - 1)}>
                {pageNumber}
              </span>
            </div>
          </div>
        ))}
      </div>

      <button disabled={pageIndex >= totalPages - 1} onClick={() => onPageChange(pageIndex + 1)}>
        <Icon name="svg:chevron-right" size="1rem" />
      </button>
    </div>
  );
};

const ActionItem = ({ action, item, actionIndex }: { action: TableItemAction; item: TableBodyItemProps['item']; actionIndex: number }) => {
  const { t } = useTranslation();
  const { call, loading } = useAsyncFn(action.onClick);

  const label = action.label instanceof Function ? action.label(item) : action.label;
  const iconName = action.iconName instanceof Function ? action.iconName(item) : action.iconName;

  const ref = useTooltip<HTMLDivElement>({ text: t(label) });

  const onActionClick = async (ev: MouseEvent<SVGSVGElement>) => {
    ev.preventDefault();
    ev.stopPropagation();
    await call(item);
  };

  return (
    <div ref={ref} key={`action-${actionIndex}-${action.label}`} className="relative">
      {loading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Spinner size="2rem" />
        </div>
      )}

      <Icon className={cn(loading && 'opacity-25', action.className)} size="1.25rem" name={iconName} aria-label={t(label)} onClick={onActionClick} />
    </div>
  );
};

const Actions = ({ item, actions }: { item: TableBodyItemProps['item']; actions: TableProps['customActions'] }) => {
  if (!actions?.length) {
    return null;
  }

  return (
    <div className={cn(styles['data-table--actions'])}>
      {actions.map((action, actionIndex) => (
        <ActionItem key={`action-${actionIndex}-${action.label}`} action={action} item={item} actionIndex={actionIndex} />
      ))}
    </div>
  );
};

const TableActions = (props: Pick<TableProps, 'createCallback' | 'exportCallback' | 'tableActions'>) => {
  const actions: Array<MenuItem> = [...(props.tableActions || [])];

  if (props.createCallback) {
    actions.unshift({ label: 'GENERAL.ADD', iconName: 'svg:plus', onClick: props.createCallback });
  }

  if (props.exportCallback) {
    actions.push({ label: 'GENERAL.EXPORT', iconName: 'svg:attachment', onClick: props.exportCallback });
  }

  return actions.length ? (
    <td>
      <div className="flex justify-end pe-1">
        <Menu className="my-auto" showSingleAction items={actions} activator="svg:dots-vertical" />
      </div>
    </td>
  ) : null;
};

export default function Table({ className, pageIndex, ...props }: TableProps) {
  const { t } = useTranslation();
  const tableRef = useRef<HTMLDivElement | null>(null);
  const { items, totalPages } = useTableItems(props);
  const emptyState = props.emptyState || <span className="text-xl font-medium">{t('GENERAL.EMPTY')}</span>;
  const headers = getHeadersWithActions(props);
  const actions = TableActions(props);

  return (
    <div className={cn('overflow-x-auto', styles['data-table'], className, props.loading && styles['data-table--loading'])}>
      <div ref={tableRef} className={cn(props.items?.length && 'h-full')}>
        <table className={cn('flex-grow', props.showGrid && styles['data-table--grid'])}>
          <Header headers={headers} sort={props.pageSort} draggable={props.draggable} actions={actions} onSort={props.onSort} />

          <Body
            headers={headers}
            items={items}
            loading={props.loading}
            rowClickable={props.rowClickable || !!props.onRowClick}
            onRowClick={props.onRowClick}
            keyboardDisabled={props.keyboardDisabled}
          />
        </table>
      </div>

      {!items?.length && <div className="flex items-center justify-center flex-grow opacity-50 select-none">{emptyState}</div>}

      <Pagination keyboardDisabled={props.keyboardDisabled} pageIndex={pageIndex} totalPages={totalPages} onPageChange={props.onPageChange} />
    </div>
  );
}
