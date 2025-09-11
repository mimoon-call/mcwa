import type { MenuItem } from '@components/Menu/Menu.type';
import type { ChatMessage, GlobalChatContact } from '../store/chat.types';
import type { ChatContact } from '../../Instance/store/chat.types';
import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';
import { cn } from '@client/plugins';
import ChatMessages from './ChatMessages';
import { TextField } from '@components/Fields';
import { useAsyncFn, useToast } from '@hooks';
import { Menu } from '@components/Menu/Menu';

type RightPanelProps = {
  menuItems?: MenuItem[];
  selectedContact?: ChatContact | GlobalChatContact | null;
  messages?: ChatMessage[];
  disabled?: boolean;
  loading: boolean;
  error: boolean;
  phoneNumber?: string;
  withPhoneNumber?: string;
  className?: string;
  headerComponent?: React.ReactNode;
  onSendMessage: (phoneNumber: string, withPhoneNumber: string, text: string) => void;
  onRetry?: (tempId: string) => void;
};

const ChatRightPanel: React.FC<RightPanelProps> = ({
  selectedContact,
  messages = [],
  disabled = false,
  loading,
  error,
  phoneNumber,
  withPhoneNumber,
  headerComponent,
  onSendMessage,
  onRetry,
  className,
  menuItems,
}) => {
  const toast = useToast({ y: 'top' });
  const { t } = useTranslation();
  const [message, setMessage] = React.useState('');
  const refInput = React.useRef<HTMLInputElement>(null);

  const { call: send, loading: isSending } = useAsyncFn(() => onSendMessage(phoneNumber!, withPhoneNumber!, message), {
    successCallback: () => {
      setMessage('');
      refInput.current?.focus();
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
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {/* Floating 3 dots menu */}
            {phoneNumber && withPhoneNumber && !!menuItems?.length && (
              <div className="absolute top-4 rtl:left-4 ltr:right-4 z-40">
                <Menu
                  activator="svg:dots-vertical"
                  items={menuItems}
                  className="bg-white shadow-lg border border-gray-200 rounded-lg min-w-[200px]"
                />
              </div>
            )}

            <ChatMessages
              messages={messages}
              loading={loading}
              error={error}
              phoneNumber={phoneNumber}
              withPhoneNumber={withPhoneNumber}
              onRetry={onRetry}
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
        <div className="bg-white px-4 pt-2 pb-4 flex-shrink-0 border-t">
          <div className="flex gap-2 items-center">
            <TextField
              ref={refInput}
              className="flex-grow"
              containerClass="!rounded-full !p-4"
              hideDetails
              autoCapitalize="off"
              type="text"
              name="messageInput"
              disabled={disabled}
              value={message}
              onChange={setMessage}
              onKeyDown={onKeyDown}
              placeholder={t('GENERAL.ENTER_MESSAGE')}
            />

            <Icon className="hover:text-blue-500" name="svg:paper-plane" size="1.75rem" onClick={!disabled && !isSending ? send : undefined} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRightPanel;
