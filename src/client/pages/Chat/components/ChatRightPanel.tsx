import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';
import { cn } from '@client/plugins';
import type { ChatMessage, GlobalChatContact } from '../store/chat.types';
import type { ChatContact } from '../../Instance/store/chat.types';
import ChatMessages from './ChatMessages';
import { TextField } from '@components/Fields';
import { useAsyncFn, useToast } from '@hooks';

type RightPanelProps = {
  selectedContact?: ChatContact | GlobalChatContact | null;
  messages?: ChatMessage[];
  disabled?: boolean;
  loading: boolean;
  error: boolean;
  phoneNumber?: string;
  withPhoneNumber?: string;
  hasMore: boolean;
  className?: string;
  headerComponent?: React.ReactNode;
  onSendMessage: (phoneNumber: string, withPhoneNumber: string, text: string) => void;
};

const ChatRightPanel: React.FC<RightPanelProps> = ({
  selectedContact,
  messages = [],
  disabled = false,
  loading,
  error,
  phoneNumber,
  withPhoneNumber,
  hasMore,
  headerComponent,
  onSendMessage,
  className,
}) => {
  const toast = useToast({ y: 'top' });
  const { t } = useTranslation();
  const [message, setMessage] = React.useState('');

  const { call: send, loading: isSending } = useAsyncFn(() => onSendMessage(phoneNumber!, withPhoneNumber!, message), {
    successCallback: () => {
      setMessage('');
    },
    errorCallback: () => {
      toast.error('CHAT.SENDING_MESSAGE_FAILED');
    },
  });

  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={cn('flex-1 flex flex-col h-full max-h-full', className)}>
      {selectedContact ? (
        <>
          {/* Chat Header */}
          {headerComponent}

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
              containerClass="!rounded-full !p-4"
              hideDetails
              autoCapitalize="off"
              type="text"
              name="messageInput"
              disabled={disabled || isSending}
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

export default ChatRightPanel;
