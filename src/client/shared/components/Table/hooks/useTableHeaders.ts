// src/client/shared/components/Table/hooks/useTableHeaders.ts
import type { TableHeader, TableHeaderProps, TableHeaders } from '../Table.type';
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState, useCallback } from 'react';
import { uniqueKey } from '@helpers/unique-key';

type DragData = {
  startX: number;
  leftWidth: number;
  rightWidth: number;
} | null;

const RESIZE_THRESHOLD = 6;
const MIN_WIDTH = 60;

export const useTableHeaders = ({ headers, sort, onSort }: TableHeaderProps) => {
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const colRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const [tableHeaders, setTableHeaders] = useState<TableHeaders>(headers);
  const [edgeIndex, setEdgeIndex] = useState<number | null>(null);
  const dragData = useRef<DragData>(null);
  const didDrag = useRef<boolean>(false);

  const isRtl = useCallback(() => theadRef.current && window.getComputedStyle(theadRef.current).direction === 'rtl', []);

  const getColumnWidth = useCallback(() => {
    const key = uniqueKey(headers.map(({ value }) => value));
    const storeValue = localStorage.getItem(key);

    return storeValue ? JSON.parse(storeValue) : null;
  }, [headers]);

  useEffect(() => {
    const columnWidth: Record<string, string> | null = getColumnWidth();

    setTableHeaders(() => {
      const tableWidth = theadRef.current?.getBoundingClientRect().width || window.innerWidth;

      return headers.map((header, index) => {
        const width =
          columnWidth?.[header.value] ||
          header.style?.width ||
          colRefs.current[index]?.getBoundingClientRect().width ||
          `${tableWidth / headers.length}px`;

        return { ...header, style: { ...(header.style || {}), width } };
      });
    });
  }, [headers]);

  const detectEdge = useCallback((e: ReactMouseEvent<HTMLElement>, cell: HTMLElement, headerIndex: number) => {
    const rect = cell.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const onLeft = x <= RESIZE_THRESHOLD && headerIndex > 0;
    const onRight = x >= rect.width - RESIZE_THRESHOLD && headerIndex < headers.length - 1;

    if (isRtl()) {
      return { onLeft: onRight, onRight: onLeft }; // mirror behavior
    }

    return { onLeft, onRight };
  }, [headers.length]);

  const mouseMoveHandler = useCallback((e: MouseEvent) => {
    if (!dragData.current || edgeIndex === null) return;

    didDrag.current = true;

    let delta = e.clientX - dragData.current.startX;
    if (isRtl()) {
      delta = -delta;
    }

    const left = colRefs.current[edgeIndex];
    const right = colRefs.current[edgeIndex + 1];
    if (!left || !right) return;

    const newLeft = Math.max(MIN_WIDTH, dragData.current.leftWidth + delta);
    const newRight = Math.max(MIN_WIDTH, dragData.current.rightWidth - delta);

    left.style.width = `${newLeft}px`;
    right.style.width = `${newRight}px`;
  }, [edgeIndex, colRefs, isRtl]);

  const stopResize = useCallback(() => {
    dragData.current = null;
    setEdgeIndex(null);

    document.body.style.cursor = '';
    window.removeEventListener('mousemove', mouseMoveHandler);
    window.removeEventListener('mouseup', stopResize);

    // Save column widths...
    if (theadRef.current) {
      const tableWidth = theadRef.current.getBoundingClientRect().width;
      const columnWidth = headers
        .filter(({ hidden }) => !hidden)
        .reduce((acc: Record<string, string>, { value }, headerIndex) => {
          const width = colRefs.current[headerIndex]!.getBoundingClientRect().width;
          const widthPercentage = (width / tableWidth) * 100;
          return { ...acc, [value]: `${widthPercentage}%` };
        }, {});
      const key = uniqueKey(headers.map(({ value }) => value));
      localStorage.setItem(key, JSON.stringify(columnWidth));
    }

    // Reset drag flag after next frame
    requestAnimationFrame(() => {
      didDrag.current = false;
    });
  }, [mouseMoveHandler, headers, colRefs, theadRef]);

  const onMouseOver = useCallback((headerIndex: number) => (e: ReactMouseEvent<HTMLElement>) => {
    const cell = e.currentTarget as HTMLElement;

    if (typeof window === 'undefined') {
      return;
    }

    const { onLeft, onRight } = detectEdge(e, cell, headerIndex);

    if (onLeft) {
      cell.style.cursor = 'ew-resize';
      setEdgeIndex(headerIndex - 1); // resizer between headerIndex-1 & idx
    } else if (onRight) {
      cell.style.cursor = 'ew-resize';
      setEdgeIndex(headerIndex); // resizer between headerIndex & headerIndex+1
    } else {
      cell.style.cursor = 'default';
      setEdgeIndex(null);
    }
  }, [detectEdge, setEdgeIndex]);

  const onMouseDown = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (edgeIndex === null) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const leftWidth = colRefs.current[edgeIndex]?.getBoundingClientRect().width;
    const rightWidth = colRefs.current[edgeIndex + 1]?.getBoundingClientRect().width;

    if (!leftWidth || !rightWidth) {
      return;
    }

    dragData.current = { startX: e.clientX, leftWidth, rightWidth };
    document.body.style.cursor = 'ew-resize';
    window.addEventListener('mousemove', mouseMoveHandler);
    window.addEventListener('mouseup', stopResize);
  }, [edgeIndex, mouseMoveHandler, stopResize, colRefs]);

  const onClick = useCallback((value: TableHeader['value'], sortable?: TableHeader['sortable']) => {
    if (edgeIndex !== null || !sortable || didDrag.current) {
      return;
    }

    const newSort = { ...(sort || {}) };

    const toggle = (k: string) => {
      if (newSort[k] === 1) {
        delete newSort[k];
      } else if (newSort[k] === -1) {
        newSort[k] = 1;
      } else {
        newSort[k] = -1;
      }
    };

    (Array.isArray(sortable) ? sortable : sortable ? [value] : [value]).forEach(toggle);
    onSort?.(newSort);
  }, [edgeIndex, sort, onSort, didDrag]);

  useEffect(() => () => stopResize(), [stopResize]); // cleanup on unmount

  return { theadRef, colRefs, tableHeaders, onClick, onMouseOver, onMouseDown };
};
