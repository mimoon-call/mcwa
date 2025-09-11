import type { GlobalChatContact } from '../store/chat.types';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import Avatar from '@components/Avatar/Avatar';
import Icon from '@components/Icon/Icon';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';
import { formatTime } from '../helpers';

type ChatListItemProps = {
  contact: GlobalChatContact;
  isSelected: boolean;
  onClick: (contact: GlobalChatContact) => void;
  className?: string;
};

const ChatListItem: React.FC<ChatListItemProps> = ({ contact, isSelected, onClick }) => {
  const { t } = useTranslation();

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
          <div className="font-semibold text-gray-900 truncate" dir={isNaN(+contact.name) ? undefined : 'ltr'}>
            {internationalPhonePrettier(contact.name, '-', true)}
          </div>

          <div className="text-xs text-gray-500">{formatTime(contact.lastMessageAt, t)}</div>
        </div>

        {/* Instance Number > Phone Number */}
        <div className="flex items-center justify-between mt-1">
          <div className="font-medium text-sm text-gray-600 truncate flex gap-1">
            <span dir="ltr">{internationalPhonePrettier(contact.instanceNumber, '-', true)}</span>
            <Icon name="svg:arrow-two-way" size="1rem" />
            <span dir="ltr">{internationalPhonePrettier(contact.phoneNumber, '-', true)}</span>
          </div>
        </div>

        {/* Last Message */}
        <div className="flex items-center justify-between mt-1">
          <div className="text-sm text-gray-600 truncate flex-1">{contact.lastMessage}</div>
        </div>

        {/* Additional Info */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            {contact.department && <div className="font-semibold text-xs text-blue-600">{t(`CHAT.DEPARTMENT.${contact.department}`)}</div>}
            {contact.messageCount > 0 && (
              <div className="text-xs text-gray-500">
                {contact.messageCount} {t('GENERAL.MESSAGES')}
              </div>
            )}
          </div>

          {contact.interested && <div className="font-bold text-xs text-green-600">{t('GENERAL.INTERESTED')}</div>}
        </div>
      </div>
    </div>
  );
};

export default ChatListItem;
