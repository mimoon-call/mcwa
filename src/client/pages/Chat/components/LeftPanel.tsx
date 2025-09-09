import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@client/shared/components/Icon/Icon';
import { cn } from '@client/plugins';
import type { ChatContact } from '../store/chat.types';
import { TextField } from '@components/Fields';
import { useInfiniteScrollConversations } from '../hooks';

type LeftPanelProps = {
  phoneNumber?: string;
  searchMetadata?: {
    isConnected: boolean;
    errorMessage?: string | null;
    statusCode?: number | null;
  } | null;
  conversations?: ChatContact[];
  selectedPhoneNumber?: string;
  loading: boolean;
  error: boolean;
  hasMore?: boolean;
  searchValue?: string;
  onChatSelect: (phoneNumber: string) => void;
  onSearch: (value: string) => void;
  className?: string;
};

const LeftPanel: React.FC<LeftPanelProps> = ({
  phoneNumber,
  searchMetadata,
  conversations,
  selectedPhoneNumber,
  loading,
  error,
  hasMore = false,
  searchValue = '',
  onChatSelect,
  onSearch,
  className,
}) => {
  const { t } = useTranslation();
  const [localSearchValue, setLocalSearchValue] = useState(searchValue);

  // Use infinite scroll hook
  const { scrollContainerRef } = useInfiniteScrollConversations({
    phoneNumber,
    hasMore,
    loading,
    threshold: 100,
    minimumItems: 20,
  });

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onSearch(localSearchValue);
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [localSearchValue, onSearch]);

  // Initialize local search value only on mount
  useEffect(() => {
    setLocalSearchValue(searchValue);
  }, []); // Empty dependency array - only run on mount

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearchValue(value);
  }, []);

  const getDisplayName = (contact: ChatContact) => {
    return contact.name || contact.phoneNumber;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className={cn('w-1/3 bg-white border-r border-gray-200 flex flex-col', className)}>
      {/* Header */}
      <div className={`${searchMetadata?.isConnected ? 'bg-green-600' : 'bg-red-600'} text-white p-4 flex items-center justify-between`}>
        <div className="flex items-center space-x-3">
          <div className="flex flex-col gap-1">
            <div className="font-semibold">{phoneNumber || 'Instance'}</div>
            <div className="text-xs opacity-90">
              {searchMetadata?.isConnected ? t('INSTANCE.STATUS.CONNECTED') : t('INSTANCE.STATUS.DISCONNECTED')}
            </div>
            {searchMetadata?.errorMessage && (
              <div className="text-xs opacity-75 mt-1">
                {searchMetadata.statusCode && `${t('INSTANCE.STATUS_CODE')}: ${searchMetadata.statusCode}`}
                {searchMetadata.statusCode && ' | '}
                {t('INSTANCE.ERROR_MESSAGE')}: {searchMetadata.errorMessage}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Icon name="svg:cog" size="1rem" className="cursor-pointer" />
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-0.5 border-b border-gray-200">
        <TextField hideDetails name="search" placeholder={t('GENERAL.SEARCH_PLACEHOLDER')} value={localSearchValue} onChange={handleSearchChange} />
      </div>

      {/* Chat List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {loading && (!conversations || conversations.length === 0) ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500">{t('GENERAL.LOADING')}</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-red-500">{t('GENERAL.ERROR')}</div>
          </div>
        ) : !conversations || conversations.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500">{t('GENERAL.EMPTY')}</div>
          </div>
        ) : (
          <>
            {conversations.map((contact) => (
              <div
                key={contact.phoneNumber}
                className={cn(
                  'p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 flex items-center space-x-3',
                  selectedPhoneNumber === contact.phoneNumber && 'bg-green-50 border-l-4 border-l-green-500'
                )}
                onClick={() => onChatSelect(contact.phoneNumber)}
              >
                <div className="relative">
                  <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                    <Icon name="svg:user" size="1.25rem" className="text-gray-600" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900 truncate">{getDisplayName(contact)}</div>
                    <div className="text-xs text-gray-500">{formatTime(contact.lastMessageAt)}</div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-sm text-gray-600 truncate flex-1">{contact.lastMessage}</div>
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator for infinite scroll */}
            {loading && conversations && conversations.length > 0 && (
              <div className="flex items-center justify-center p-4">
                <div className="text-gray-500 text-sm">{t('GENERAL.LOADING_MORE')}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LeftPanel;
