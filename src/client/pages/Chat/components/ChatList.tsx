import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';
import { cn } from '@client/plugins';
import dayjs from '@client/locale/dayjs';
import { DateFormat } from '@client-constants';
import type { ChatContact } from '../store/chat.types';

type ChatListProps = {
  conversations?: ChatContact[];
  selectedPhoneNumber?: string;
  loading: boolean;
  error: boolean;
  onChatSelect: (phoneNumber: string) => void;
  className?: string;
};

const ChatList: React.FC<ChatListProps> = ({ conversations, selectedPhoneNumber, loading, error, onChatSelect, className }) => {
  const { t } = useTranslation();

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
    <div className={cn('flex-1 overflow-y-auto', className)}>
      {loading ? (
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
        conversations.map((contact) => (
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
        ))
      )}
    </div>
  );
};

export default ChatList;
