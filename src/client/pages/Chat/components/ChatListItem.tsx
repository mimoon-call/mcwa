import type { GlobalChatContact } from '../store/chat.types';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import Avatar from '@components/Avatar/Avatar';
import Icon from '@components/Icon/Icon';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';
import { formatTime } from '../helpers';
import { ChatIntentEnum } from '@client/pages/Chat/store/chat.enum';

type ChatListItemProps = {
  contact: GlobalChatContact;
  isSelected: boolean;
  onClick: (contact: GlobalChatContact) => void;
  className?: string;
};

const Interested = ({ contact }: { contact: GlobalChatContact }) => {
  const { t } = useTranslation();
  let className: string;

  if (contact.interested) return <div className="font-bold text-xs text-green-600">{t('GENERAL.INTERESTED')}</div>;
  if (!contact.intent) return null;

  switch (contact.intent) {
    case ChatIntentEnum.POSITIVE_INTEREST:
      className = 'text-green-600';
      break;
    case ChatIntentEnum.REQUEST_INFO:
      className = 'text-blue-600';
      break;
    case ChatIntentEnum.NEUTRAL:
      className = 'text-gray-600';
      break;
    case ChatIntentEnum.NOT_NOW:
      className = 'text-yellow-600';
      break;
    case ChatIntentEnum.DECLINE:
      className = 'text-orange-600';
      break;
    case ChatIntentEnum.OUT_OF_SCOPE:
      className = 'text-purple-600';
      break;
    case ChatIntentEnum.AMBIGUOUS:
      className = 'text-pink-600';
      break;
    case ChatIntentEnum.ABUSIVE:
      className = 'text-red-600';
      break;
    case ChatIntentEnum.UNSUBSCRIBE:
      className = 'text-red-700';
      break;
    default:
      className = 'text-gray-600';
  }

  return (
    <div className="flex gap-1 text-xs">
      {contact.confidence && <span className="text-gray-500">{contact.confidence}</span>}
      <div className={cn('font-bold text-xs', className)}>{t(`CHAT.INTENT.${contact.intent}`)}</div>
    </div>
  );
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

          <Interested contact={contact} />
        </div>
      </div>
    </div>
  );
};

export default ChatListItem;
