import React from 'react';
import Icon from '@components/Icon/Icon';
import type { ChatContact } from '../store/chat.types';
import Avatar from '@components/Avatar/Avatar';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';

type ChatHeaderProps = {
  contact: ChatContact;
  onClose?: () => void;
};

const ChatHeader: React.FC<ChatHeaderProps> = ({ contact, onClose }) => {
  const title = contact.name || contact.phoneNumber;

  return (
    <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2 space-x-3">
        <Avatar size="2.75rem" src={null} alt={contact.name || contact.phoneNumber} />

        <div>
          <div className="font-semibold" dir={isNaN(+title) ? undefined : 'ltr'}>
            {internationalPhonePrettier(title, '-', true)}
          </div>

          {title !== contact.phoneNumber && <div className="text-sm text-gray-500">{internationalPhonePrettier(contact.phoneNumber, '-', true)}</div>}
        </div>
      </div>
      {onClose && <Icon name="svg:times" size="1.25rem" className="text-gray-500 cursor-pointer" onClick={onClose} />}
    </div>
  );
};

export default ChatHeader;
