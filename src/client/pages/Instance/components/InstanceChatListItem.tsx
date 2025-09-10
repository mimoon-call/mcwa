import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import dayjs from '@client/locale/dayjs';
import { DateFormat } from '@client-constants';
import type { ChatContact } from '../store/chat.types';
import Avatar from '@components/Avatar/Avatar';

type InstanceChatListItemProps = {
  contact: ChatContact;
  isSelected: boolean;
  onClick: (contact: ChatContact) => void;
  className?: string;
};

const InstanceChatListItem: React.FC<InstanceChatListItemProps> = ({
  contact,
  isSelected,
  onClick,
}) => {
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
        
        <div className="flex items-center justify-between mt-1">
          <div className="text-sm text-gray-600 truncate flex-1">
            {contact.lastMessage}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstanceChatListItem;
