import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@client/shared/components/Icon/Icon';
import { cn } from '@client/plugins';
import dayjs from '@client/locale/dayjs';
import { DateFormat } from '@client/shared/constants';
import type { ChatContact, InstanceChat } from '../store/chat.types';
import { TextField } from '@components/Fields';
import { useInfiniteScrollConversations } from '../hooks';
import Avatar from '@components/Avatar/Avatar';

type LeftPanelProps = {
  phoneNumber?: string;
  searchMetadata?: InstanceChat | null;
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
    const date = dayjs(dateString);
    const now = dayjs();

    // If the date is today, show only time
    if (date.isSame(now, 'day')) {
      return date.format(DateFormat.TIME_FORMAT);
    }

    // If the date is yesterday, show "Yesterday" with time
    if (date.isSame(now.subtract(1, 'day'), 'day')) {
      return `${t('GENERAL.YESTERDAY')} ${date.format(DateFormat.TIME_FORMAT)}`;
    }

    // For all other dates (not today or yesterday), show full date and time
    return date.format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT);
  };

  return (
    <div className={cn('w-1/4 min-w-[400px] bg-white border-e border-gray-200 flex flex-col', className)}>
      {/* Header */}
      <div className={`${searchMetadata?.isConnected ? 'bg-green-600' : 'bg-red-600'} text-white p-4 flex items-center justify-between`}>
        <div className="flex items-center space-x-3">
          <div className="flex flex-col gap-1">
            <div className="flex gap-2 items-center">
              {/*<Avatar size="48px" src={searchMetadata?.profilePictureUrl} alt="GENERAL.PROFILE_PICTURE" />*/}

              <div>
                <div className="text-xl font-semibold">{phoneNumber || 'Instance'}</div>
                <div className="text-sm opacity-90">
                  {searchMetadata?.isConnected ? t('INSTANCE.STATUS.CONNECTED') : t('INSTANCE.STATUS.DISCONNECTED')}
                </div>
              </div>
            </div>

            {searchMetadata?.errorMessage && (
              <div className="flex gap-0.5 items-center">
                <Icon className="inline text-yellow-300 me-1 mt-1" name="svg:warning" size="0.875rem" />

                <div className="text-sm opacity-75 mt-1">
                  {searchMetadata.statusCode && `${t('INSTANCE.STATUS_CODE')}: ${searchMetadata.statusCode}`}
                  {searchMetadata.statusCode && ' | '}
                  {t('INSTANCE.ERROR_MESSAGE')}: {searchMetadata.errorMessage}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-0.5 py-1 border-b border-gray-200">
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
                  'p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 flex items-center space-x-3 gap-2',
                  selectedPhoneNumber === contact.phoneNumber && 'bg-green-50 border-l-4 border-l-green-500'
                )}
                onClick={() => onChatSelect(contact.phoneNumber)}
              >
                <Avatar size="48px" src={contact.profilePictureUrl} alt={contact.name} />

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
