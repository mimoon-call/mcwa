import React, { useCallback, useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import { TextField } from '@components/Fields';
import { DEPARTMENT_OPTIONS, INTENT_OPTIONS, INTERESTED_OPTIONS } from '@client/pages/Chat/constants/chat.constants';
import type { Options } from '@models';

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
  searchComponent?: ReactNode;
  // Filter props
  selectedIntents?: string[];
  selectedDepartments?: string[];
  selectedInterested?: boolean | null;
  onIntentsChange?: (intents: string[]) => void;
  onDepartmentsChange?: (departments: string[]) => void;
  onInterestedChange?: (interested: boolean | null) => void;
};

type ListProps<T> = Pick<
  ChatLeftPanelProps<T>,
  'loading' | 'items' | 'error' | 'isItemSelected' | 'selectedItem' | 'onItemSelect' | 'getItemKey' | 'itemComponent' | 'onLoadMore' | 'hasMore'
>;

const Filter = <T = string | boolean | number,>(props: {
  options: Options<T>;
  handleToggle: (value: T) => void;
  selectedOptions: T[] | T | null;
  isMultiSelect?: boolean;
}) => {
  const { t } = useTranslation();
  const { options, handleToggle, selectedOptions, isMultiSelect = true } = props;

  return options.map((option) => {
    const title = typeof option.title === 'string' ? t(option.title) : option.title;
    const isSelected = isMultiSelect ? Array.isArray(selectedOptions) && selectedOptions.includes(option.value) : selectedOptions === option.value;
    const buttonRef = useRef<HTMLButtonElement>(null);

    const onClick = () => {
      handleToggle(option.value);

      setTimeout(() => buttonRef.current?.blur(), 50);
    };

    return (
      <button
        ref={buttonRef}
        key={String(option.value)}
        type="button"
        onClick={onClick}
        className={cn(
          'px-3 py-0.5 rounded-full text-sm font-medium transition-colors duration-200',
          'border border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
          isSelected ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600 hover:border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50'
        )}
      >
        {title}
      </button>
    );
  });
};

const List = <T extends object>({
  loading,
  items,
  error,
  isItemSelected,
  selectedItem,
  onItemSelect,
  getItemKey,
  itemComponent,
  onLoadMore,
  hasMore,
}: ListProps<T>) => {
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
  const {
    searchValue = '',
    onSearch,
    headerComponent,
    searchComponent,
    className,
    onLoadMore,
    hasMore,
    selectedIntents = [],
    selectedDepartments = [],
    selectedInterested = null,
    onIntentsChange,
    onDepartmentsChange,
    onInterestedChange,
    ...listProps
  } = props;
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

  const handleIntentToggle = useCallback(
    (intent: string) => {
      if (!onIntentsChange) return;
      const newIntents = selectedIntents.includes(intent) ? selectedIntents.filter((i) => i !== intent) : [...selectedIntents, intent];
      onIntentsChange(newIntents);
    },
    [selectedIntents, onIntentsChange]
  );

  const handleDepartmentToggle = useCallback(
    (department: string) => {
      if (!onDepartmentsChange) return;
      const newDepartments = selectedDepartments.includes(department)
        ? selectedDepartments.filter((d) => d !== department)
        : [...selectedDepartments, department];
      onDepartmentsChange(newDepartments);
    },
    [selectedDepartments, onDepartmentsChange]
  );

  const handleInterestedToggle = useCallback(
    (interested: boolean) => {
      if (!onInterestedChange) return;
      const newInterested = selectedInterested === interested ? null : interested;
      onInterestedChange(newInterested);
    },
    [selectedInterested, onInterestedChange]
  );

  return (
    <div className={cn('w-1/4 min-w-[400px] bg-white border-e border-gray-200 flex flex-col', className)}>
      {/* Header */}
      {headerComponent}

      {/* Search Bar */}
      <div className="px-0.5 py-1 border-gray-200 flex flex-col gap-3">
        <TextField
          clearable
          hideDetails
          name="search"
          placeholder={t('GENERAL.SEARCH_PLACEHOLDER')}
          value={localSearchValue}
          onChange={handleSearchChange}
        />

        {/* Filters */}
        <div className="pb-2 px-0.5">
          <div className="flex flex-wrap gap-2">
            {/* Interested Filter */}
            {onInterestedChange && (
              <Filter options={INTERESTED_OPTIONS} handleToggle={handleInterestedToggle} selectedOptions={selectedInterested} isMultiSelect={false} />
            )}

            {/* Intent Filter */}
            {onIntentsChange && <Filter options={INTENT_OPTIONS} handleToggle={handleIntentToggle} selectedOptions={selectedIntents} />}

            {/* Department Filter */}
            {onDepartmentsChange && (
              <Filter options={DEPARTMENT_OPTIONS} handleToggle={handleDepartmentToggle} selectedOptions={selectedDepartments} />
            )}
          </div>
        </div>

        {searchComponent}
      </div>

      {/* Items List */}
      <List {...listProps} onLoadMore={onLoadMore} hasMore={hasMore} />
    </div>
  );
};

export default ChatLeftPanel;
