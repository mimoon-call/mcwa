// src/client/shared/components/Table/hooks/useTablePagination.ts
import type { TablePaginationProps } from '@components/Table/Table.type';
import { useEffect, useRef, useState, useCallback } from 'react';

export const useTablePagination = ({ pageIndex = 0, totalPages = 1, keyboardDisabled, onPageChange }: TablePaginationProps) => {
  const pageNumMap = Array.from({ length: totalPages }).map((_, i) => i + 1);
  const pageNumRef = useRef<HTMLDivElement | null>(null);
  const pageNumRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const setItemRefs = useCallback((i: number) => (el: HTMLSpanElement | null) => {
    pageNumRefs.current[i] = el;
  }, []);
  const [localIndex, setLocalIndex] = useState<number>(pageIndex);

  const handleClick = useCallback((newIndex: number) => {
    if (newIndex > totalPages - 1 || newIndex < 0) {
      return;
    }

    const scrollSteps = localIndex < newIndex ? Math.min(newIndex + 3, totalPages - 1) : Math.max(newIndex - 3, 0);
    pageNumRefs.current[scrollSteps]?.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
    onPageChange?.(newIndex);
  }, [totalPages, localIndex, onPageChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (keyboardDisabled) {
      return;
    }

    if (e.key === 'PageUp') {
      e.preventDefault();
      handleClick(localIndex - 1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      handleClick(localIndex + 1);
    }
  }, [keyboardDisabled, handleClick, localIndex]);

  useEffect(() => {
    setLocalIndex(pageIndex);
  }, [pageIndex, totalPages]);

  useEffect(() => {
    if (!keyboardDisabled) {
      window.addEventListener('keydown', handleKeyDown);
    } else {
      window.removeEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [keyboardDisabled, handleKeyDown]);

  return {
    pageNumMap,
    pageNumRef,
    pageIndex: localIndex,
    totalPages,
    setItemRefs,
    onPageChange: handleClick,
  };
};
