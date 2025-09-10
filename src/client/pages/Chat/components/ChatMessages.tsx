import type { ChatMessage } from '../store/chat.types';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import { useInfiniteScroll } from '@client/pages/Instance/hooks';
import ChatMessageItem from './ChatMessageItem';
import ChatStickyDate from './ChatStickyDate';

type ChatMessagesProps = {
  messages: ChatMessage[];
  loading: boolean;
  error: boolean;
  phoneNumber?: string;
  withPhoneNumber?: string;
  hasMore: boolean;
  className?: string;
};

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, loading, error, phoneNumber, withPhoneNumber, hasMore, className }) => {
  const { t } = useTranslation();

  const { scrollContainerRef } = useInfiniteScroll({
    phoneNumber,
    withPhoneNumber,
    hasMore,
    loading,
  });

  const isMessageFromUser = (message: ChatMessage) => {
    return message.fromNumber === phoneNumber;
  };

  // Scroll to bottom when conversation changes or new messages arrive
  useEffect(() => {
    if (scrollContainerRef.current && messages.length > 0) {
      // Use requestAnimationFrame for better timing with DOM updates
      const scrollToBottom = () => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      };

      // Use both requestAnimationFrame and setTimeout for reliability
      requestAnimationFrame(() => {
        setTimeout(scrollToBottom, 50);
      });
    }
  }, [withPhoneNumber, messages.length]);

  return (
    <div ref={scrollContainerRef} className={cn('h-full bg-gray-50 overflow-y-auto p-4 relative z-10', className)}>
      {/* Sticky Date Separator */}
      <ChatStickyDate messages={messages} scrollContainerRef={scrollContainerRef} />

      {/* Load More Button - Only show if hasMore is true */}
      {hasMore && (
        <div className="text-center mb-4">
          <button className="px-4 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-300">{t('GENERAL.LOAD_MORE_MESSAGES')}</button>
        </div>
      )}

      {/* Messages */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">{t('GENERAL.LOADING')}</div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-red-500">{t('GENERAL.ERROR')}</div>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">{t('GENERAL.EMPTY')}</div>
        </div>
      ) : (
        messages.map((message, index) => {
          const isFromUser = isMessageFromUser(message);

          return (
            <div key={`${message.createdAt}-${index}`} data-message-index={index}>
              <ChatMessageItem message={message} isFromUser={isFromUser} showDate={true} showFullDateTime={true} />
            </div>
          );
        })
      )}
    </div>
  );
};

export default ChatMessages;
