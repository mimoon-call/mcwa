import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@client/shared/components/Icon/Icon';
import { cn } from '@client/plugins';
import type { ChatMessage } from '../store/chat.types';
import { useInfiniteScroll } from '@client/pages/Chat/hooks';
import MessageItem from './MessageItem';
import StickyDateSeparator from './StickyDateSeparator';

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
    <div ref={scrollContainerRef} className={cn('h-full bg-gray-50 overflow-y-auto p-4 relative', className)}>
      {/* WhatsApp Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="grid grid-cols-8 gap-4 h-full">
          {Array.from({ length: 64 }).map((_, i) => (
            <div key={i} className="flex items-center justify-center">
              <Icon name="svg:comment" size="1rem" className="text-gray-400" />
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10">
        {/* Sticky Date Separator */}
        <StickyDateSeparator messages={messages} />

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
                <MessageItem message={message} isFromUser={isFromUser} showDate={true} showFullDateTime={true} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChatMessages;
