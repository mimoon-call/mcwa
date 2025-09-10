import React from 'react';
import Icon from '@components/Icon/Icon';
import type { ChatContact } from '../store/chat.types';

type ChatHeaderProps = {
  contact: ChatContact;
  onClose?: () => void;
};

const ChatHeader: React.FC<ChatHeaderProps> = ({ contact, onClose }) => {
  const getDisplayName = (contact: ChatContact) => {
    return contact.name || contact.phoneNumber;
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
          <Icon name="svg:user" size="1.25rem" className="text-gray-600" />
        </div>
        <div>
          <div className="font-semibold">{getDisplayName(contact)}</div>
          <div className="text-sm text-gray-500">
            {contact.phoneNumber}
          </div>
        </div>
      </div>
      {onClose && (
        <Icon 
          name="svg:times" 
          size="1.25rem" 
          className="text-gray-500 cursor-pointer" 
          onClick={onClose}
        />
      )}
    </div>
  );
};

export default ChatHeader;
