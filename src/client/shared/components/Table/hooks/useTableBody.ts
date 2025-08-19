// src/client/shared/components/Table/hooks/useTableBody.ts
import { type RefObject, useEffect, useRef } from 'react';
import type { TableBodyProps } from '@components/Table/Table.type';

const unwrapHighlights = (element: HTMLElement) => {
  const strongEl = element.querySelectorAll('strong');

  strongEl.forEach((strong) => {
    const parent = strong.parentNode;

    if (parent) {
      parent.replaceChild(document.createTextNode(strong.textContent || ''), strong);
      parent.normalize();
    }
  });
};

const highlightMatch = (element: HTMLElement, search: string): boolean => {
  const regex = new RegExp(`\\b(${escapeRegExp(search)})`, 'i');
  const walk = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  while (walk.nextNode()) {
    const node = walk.currentNode as Text;
    const { nodeValue } = node;

    if (!nodeValue) continue;

    const match = nodeValue.match(regex);
    if (match) {
      const matchedText = match[1];
      const parts = nodeValue.split(new RegExp(`(\\b${escapeRegExp(matchedText)})`, 'i'));

      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (part.toLowerCase() === matchedText.toLowerCase()) {
          const strong = document.createElement('strong');
          strong.textContent = part;
          frag.appendChild(strong);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      }

      node.parentNode?.replaceChild(frag, node);
      return true;
    }
  }

  return false;
};

const highlightRow = (row: HTMLTableRowElement, search: string) => {
  Array.from(row.children).forEach((cell) => {
    highlightMatch(cell as HTMLElement, search);
  });
};

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const useTableBody = (
  { items, keyboardDisabled }: Pick<TableBodyProps, 'items' | 'keyboardDisabled'>,
  tableRef: RefObject<HTMLElement | null>
) => {
  const keyboardTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const currentIndex = useRef<number>(0);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const rowTexts = useRef<Array<Array<string>>>([]);
  const searchText = useRef<string>('');

  const setFocus = (itemIndex: number, stepIndex: -1 | 1 | 0) => {
    if (keyboardTimeout.current && stepIndex === 0) {
      return;
    }

    const focusIndex = itemIndex + stepIndex;
    const clampedFocusIndex = Math.max(0, Math.min(focusIndex, (items || []).length - 1));
    const focusTarget = rowRefs.current[clampedFocusIndex];
    const scrollIndex = itemIndex + stepIndex * 3;
    const clampedScrollIndex = Math.max(0, Math.min(scrollIndex, (items || []).length - 1));
    const scrollTarget = rowRefs.current[clampedScrollIndex];

    if (focusTarget) {
      focusTarget.focus();
      currentIndex.current = clampedFocusIndex;
    }

    scrollTarget?.scrollIntoView({ block: 'nearest' });
    clearTimeout(keyboardTimeout.current);

    if (stepIndex === 0) {
      return;
    }

    keyboardTimeout.current = setTimeout(() => {
      keyboardTimeout.current = undefined;
    }, 1000);
  };

  const setRow = (i: number) => (el: HTMLTableRowElement | null) => {
    rowRefs.current[i] = el;

    if (el) {
      rowTexts.current[i] = Array.from(el.children).map((cell) => (cell.textContent || '').toLowerCase());

      el.onblur = () => {
        Array.from(el.children).forEach((cell) => {
          unwrapHighlights(cell as HTMLElement);
        });
      };
    }
  };

  useEffect(() => {
    if (rowRefs.current.length > 0) {
      rowRefs.current[0]?.focus();
    }
  }, [items]);

  const clearHighlights = () => {
    rowRefs.current.forEach((row) => {
      if (!row) {
        return;
      }

      for (const cell of Array.from(row.children)) {
        unwrapHighlights(cell as HTMLElement);
      }
    });
  };

  const onSearch = () => {
    clearTimeout(searchTimeout.current);

    if (!searchText.current) {
      return;
    }

    const searchValue = searchText.current.toLowerCase();
    const matches: { index: number; firstMatchWordIndex: number }[] = [];

    rowTexts.current.forEach((text, index) => {
      const wordIndex = text.findIndex((word) => word.startsWith(searchValue) || word.split(' ').some((val) => val.startsWith(searchValue)));

      if (wordIndex !== -1) {
        matches.push({ index, firstMatchWordIndex: wordIndex });
      }
    });

    matches.sort((a, b) => a.firstMatchWordIndex - b.firstMatchWordIndex);
    clearHighlights();

    if (matches.length > 0) {
      const bestMatch = matches[0];
      const matchRow = rowRefs.current[bestMatch.index];

      if (matchRow) {
        matchRow.focus();
        highlightRow(matchRow, searchText.current);
        matchRow.onblur = () => {
          unwrapHighlights(matchRow);

          matchRow.onblur = null; // remove after run
        };

        searchTimeout.current = setTimeout(() => (searchText.current = ''), 3000);

        return;
      } else {
        searchText.current = searchText.current.slice(0, -1);
        onSearch();
      }
    } else {
      searchText.current = searchText.current.slice(0, -1);
      onSearch();
    }
  };

  const keyboardHandler = (ev: KeyboardEvent) => {
    if (!tableRef.current?.contains(ev.target as Node)) {
      return;
    }

    if (ev.key.length === 1) {
      clearTimeout(searchTimeout.current);
      searchText.current = searchText.current + ev.key;
      onSearch();

      return;
    }

    searchText.current = '';
    clearHighlights();
    clearTimeout(searchTimeout.current);
  };

  useEffect(() => {
    if (!keyboardDisabled) {
      window.addEventListener('keydown', keyboardHandler);
    } else {
      window.removeEventListener('keydown', keyboardHandler);
      clearTimeout(searchTimeout.current);
    }

    return () => {
      window.removeEventListener('keydown', keyboardHandler);
      clearTimeout(searchTimeout.current);
    };
  }, [keyboardDisabled]);

  return {
    setRow,
    setFocus,
    searchText,
  };
};
