import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import dayjs from '@client/locale/dayjs';
import { DateFormat } from '@client-constants';
import type { ChatContact } from '../../Instance/store/chat.types';
import type { GlobalChatContact } from '../store/chat.types';
import Avatar from '@components/Avatar/Avatar';

type ChatListItemProps = {
  contact: ChatContact | GlobalChatContact;
  isSelected: boolean;
  onClick: (contact: ChatContact | GlobalChatContact) => void;
  isGlobalMode?: boolean;
  className?: string;
};

const ChatListItem: React.FC<ChatListItemProps> = ({
  contact,
  isSelected,
  onClick,
  isGlobalMode = false,
}) => {
  const { t } = useTranslation();

  const getDisplayName = (contact: ChatContact | GlobalChatContact) => {
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


  const isGlobalContact = (contact: ChatContact | GlobalChatContact): contact is GlobalChatContact => {
    return 'instanceNumber' in contact;
  };

  return (
    <div
      className={cn(
        'p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 flex items-center space-x-3 gap-2',
        isSelected && 'bg-green-50 border-l-4 border-l-green-500'
      )}
      onClick={() => onClick(contact)}
    >
      <Avatar size="48px" src={contact.profilePictureUrl} alt={contact.name} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-gray-900 truncate">
            {getDisplayName(contact)}
          </div>
          <div className="text-xs text-gray-500">
            {formatTime(contact.lastMessageAt)}
          </div>
        </div>
        
        {/* Instance Number > Phone Number (only for global mode) */}
        {isGlobalMode && isGlobalContact(contact) && (
          <div className="flex items-center justify-between mt-1">
            <div className="text-sm text-gray-600 truncate flex-1">
              <span className="font-medium">{contact.instanceNumber}</span>
              <span className="text-gray-400 mx-1">&gt;</span>
              <span>{contact.phoneNumber}</span>
            </div>
          </div>
        )}

        {/* Last Message */}
        <div className="flex items-center justify-between mt-1">
          <div className="text-sm text-gray-600 truncate flex-1">
            {contact.lastMessage}
          </div>
        </div>

        {/* Additional Info (only for global mode) */}
        {isGlobalMode && isGlobalContact(contact) && (
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              {contact.messageCount > 0 && (
                <div className="text-xs text-gray-500">
                  {contact.messageCount} {t('GENERAL.MESSAGES')}
                </div>
              )}
            </div>
            
            {contact.interested && (
              <div className="text-xs text-green-600 font-medium">
                {t('GENERAL.INTERESTED')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatListItem;
