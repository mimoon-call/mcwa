import type { ChatMessage } from '../store/chat.types';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import ChatMessageItem from './ChatMessageItem';
import ChatStickyDate from './ChatStickyDate';

type ChatMessagesProps = {
  messages: ChatMessage[];
  loading: boolean;
  error: boolean;
  phoneNumber?: string;
  withPhoneNumber?: string;
  className?: string;
  onRetry?: (tempId: string) => void;
  retryCooldowns?: Record<string, number>;
};

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, loading, error, phoneNumber, withPhoneNumber, className, onRetry, retryCooldowns = {} }) => {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  const isMessageFromUser = (message: ChatMessage) => {
    return message.fromNumber === phoneNumber;
  };

  // Scroll to bottom when conversation changes
  useEffect(() => {
    if (scrollContainerRef.current && messages.length > 0) {
      const scrollToBottom = () => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      };
      setTimeout(scrollToBottom, 100);
    }
  }, [withPhoneNumber]);

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length]);

  const renderContent = () => {
    if (loading) return <div className="flex items-center justify-center h-32 text-gray-500">{t('GENERAL.LOADING')}</div>;
    if (error) return <div className="flex items-center justify-center h-32 text-red-500">{t('GENERAL.ERROR')}</div>;
    if (messages.length === 0) return <div className="flex items-center justify-center h-32 text-gray-500">{t('GENERAL.EMPTY')}</div>;

    return messages.map((message, index) => {
      const isFromUser = isMessageFromUser(message);
      const messageKey = message.messageId || message.tempId || `${message.createdAt}-${index}`;
      const isLastMessage = index === messages.length - 1;

      return (
        <div ref={isLastMessage ? lastMessageRef : undefined} key={messageKey} data-message-index={index}>
          <ChatMessageItem message={message} isFromUser={isFromUser} showDate={true} showFullDateTime={true} onRetry={onRetry} retryCooldowns={retryCooldowns} />
        </div>
      );
    });
  };

  return (
    <div ref={scrollContainerRef} className={cn('h-full bg-gray-50 overflow-y-auto p-4 relative z-10', className)}>
      <ChatStickyDate messages={messages} scrollContainerRef={scrollContainerRef} />
      {renderContent()}
    </div>
  );
};

export default ChatMessages;
