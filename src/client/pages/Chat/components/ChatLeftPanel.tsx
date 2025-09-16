import React, { useCallback, useEffect, useState, ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import { TextField } from '@components/Fields';

type ChatLeftPanelProps<T = object> = {
  items?: T[];
  selectedItem?: T | null;
  loading: boolean;
  error: boolean;
  searchValue?: string;
  onItemSelect: (item: T) => void;
  onSearch: (value: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  headerComponent?: ReactNode;
  itemComponent: ReactNode | ((item: T, isSelected: boolean, onClick: (item: T) => void) => ReactNode);
  getItemKey: (item: T) => string;
  isItemSelected: (item: T, selectedItem: T | null) => boolean;
  className?: string;
};

type ListProps<T> = Pick<
  ChatLeftPanelProps<T>,
  'loading' | 'items' | 'error' | 'isItemSelected' | 'selectedItem' | 'onItemSelect' | 'getItemKey' | 'itemComponent' | 'onLoadMore' | 'hasMore'
>;

const List = <T extends object>({ loading, items, error, isItemSelected, selectedItem, onItemSelect, getItemKey, itemComponent, onLoadMore, hasMore }: ListProps<T>) => {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const renderItem = (item: T) => {
    const isSelected = isItemSelected(item, selectedItem || null);
    const onClick = () => onItemSelect(item);

    if (typeof itemComponent === 'function') {
      return itemComponent(item, isSelected, onClick);
    }

    return itemComponent;
  };

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || !onLoadMore || !hasMore || loading) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const threshold = 100; // Load more when 100px from bottom

    if (scrollTop + clientHeight >= scrollHeight - threshold) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, loading]);

  // Add scroll event listener
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
      {loading && (!items || items.length === 0) ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">{t('GENERAL.LOADING')}</div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-red-500">{t('GENERAL.ERROR')}</div>
        </div>
      ) : !items || items.length === 0 ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">{t('GENERAL.EMPTY')}</div>
        </div>
      ) : (
        <>
          {items.map((item) => (
            <div key={getItemKey(item)}>{renderItem(item)}</div>
          ))}

          {/* Loading indicator for infinite scroll */}
          {loading && items && items.length > 0 && hasMore && (
            <div className="flex items-center justify-center p-4">
              <div className="text-gray-500 text-sm">{t('GENERAL.LOADING_MORE')}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ChatLeftPanel = <T extends object>(props: ChatLeftPanelProps<T>) => {
  const { searchValue = '', onSearch, headerComponent, className, onLoadMore, hasMore, ...listProps } = props;
  const { t } = useTranslation();
  const [localSearchValue, setLocalSearchValue] = useState(searchValue);

  // Sync local search value with prop changes
  useEffect(() => {
    setLocalSearchValue(searchValue);
  }, [searchValue]);

  // Debounced search effect - only trigger when localSearchValue changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onSearch(localSearchValue);
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [localSearchValue, onSearch]);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearchValue(value);
  }, []);

  return (
    <div className={cn('w-1/4 min-w-[400px] bg-white border-e border-gray-200 flex flex-col', className)}>
      {/* Header */}
      {headerComponent}

      {/* Search Bar */}
      <div className="px-0.5 py-1 border-b border-gray-200">
        <TextField
          clearable
          hideDetails
          name="search"
          placeholder={t('GENERAL.SEARCH_PLACEHOLDER')}
          value={localSearchValue}
          onChange={handleSearchChange}
        />
      </div>

      {/* Items List */}
      <List {...listProps} onLoadMore={onLoadMore} hasMore={hasMore} />
    </div>
  );
};

export default ChatLeftPanel;
