import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@client/shared/components/Icon/Icon';
import { cn } from '@client/plugins';
import type { ChatContact, ChatMessage } from '../store/chat.types';
import ChatMessages from './ChatMessages';
import { TextField } from '@components/Fields';

type RightPanelProps = {
  selectedContact?: ChatContact | null;
  messages?: ChatMessage[];
  disabled?: boolean;
  loading: boolean;
  error: boolean;
  phoneNumber?: string;
  withPhoneNumber?: string;
  hasMore: boolean;
  className?: string;
  onSendMessage: (phoneNumber: string, withPhoneNumber: string, text: string) => void;
};

const RightPanel: React.FC<RightPanelProps> = ({
  selectedContact,
  messages = [],
  disabled = false,
  loading,
  error,
  phoneNumber,
  withPhoneNumber,
  hasMore,
  onSendMessage,
  className,
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = React.useState('');

  const getDisplayName = (contact: ChatContact) => {
    return contact.name || contact.phoneNumber;
  };

  const send = () => onSendMessage(phoneNumber!, withPhoneNumber!, message);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
      setMessage('');
    }
  };

  return (
    <div className={cn('flex-1 flex flex-col h-full max-h-full', className)}>
      {selectedContact ? (
        <>
          {/* Chat Header */}
          <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                <Icon name="svg:user" size="1.25rem" className="text-gray-600" />
              </div>
              <div>
                <div className="font-semibold">{getDisplayName(selectedContact)}</div>
                <div className="text-sm text-gray-500">{selectedContact.phoneNumber}</div>
              </div>
            </div>
            <Icon name="svg:times" size="1.25rem" className="text-gray-500 cursor-pointer" />
          </div>

          {/* Chat Messages */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatMessages
              messages={messages}
              loading={loading}
              error={error}
              phoneNumber={phoneNumber}
              withPhoneNumber={withPhoneNumber}
              hasMore={hasMore}
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50 min-h-0">
          <div className="text-center">
            <Icon name="svg:comment" size="3rem" className="text-gray-400 mx-auto mb-4" />
            <div className="text-gray-500">{t('GENERAL.SELECT_CHAT_TO_START')}</div>
          </div>
        </div>
      )}
      {/* Message Input - Always visible at bottom */}
      {!phoneNumber || !withPhoneNumber ? null : (
        <div className="bg-white ps-4 pt-2 pb-4 flex-shrink-0 border-t">
          <div className="flex justify-between gap-2 items-center space-x-3">
            <TextField
              className="flex-grow"
              hideDetails
              type="text"
              name="messageInput"
              disabled={disabled}
              value={message}
              onChange={setMessage}
              onKeyDown={onKeyDown}
              placeholder={t('GENERAL.ENTER_MESSAGE')}
            />

            <div className="flex items-center">
              <Icon name="svg:paper-plane" size="1.75rem" onClick={disabled ? send : undefined} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RightPanel;
