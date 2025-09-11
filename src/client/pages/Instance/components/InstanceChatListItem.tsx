import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import type { ChatContact } from '../store/chat.types';
import Avatar from '@components/Avatar/Avatar';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';
import { formatTime, getDisplayName } from '../../Chat/helpers';

type InstanceChatListItemProps = {
  contact: ChatContact;
  isSelected: boolean;
  onClick: (contact: ChatContact) => void;
  className?: string;
};

const InstanceChatListItem: React.FC<InstanceChatListItemProps> = ({ contact, isSelected, onClick }) => {
  const { t } = useTranslation();
  const title = getDisplayName(contact);

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
          <div className="font-semibold text-gray-900 truncate" dir={isNaN(+title) ? undefined : 'ltr'}>
            {internationalPhonePrettier(title, '-', true)}
          </div>
          <div className="text-xs text-gray-500">{formatTime(contact.lastMessageAt, t)}</div>
        </div>

        <div className="flex items-center justify-between mt-1">
          <div className="text-sm text-gray-600 truncate flex-1">{contact.lastMessage}</div>
        </div>
      </div>
    </div>
  );
};

export default InstanceChatListItem;
