import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@client/shared/components/Icon/Icon';
import { cn } from '@client/plugins';
import dayjs from '@client/locale/dayjs';
import type { ChatMessage } from '../store/chat.types';

type MessageItemProps = {
  message: ChatMessage;
  isFromUser: boolean;
  showDate: boolean;
  showFullDateTime?: boolean;
  className?: string;
};

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isFromUser,
  showFullDateTime = false,
  className,
}) => {
  const { t } = useTranslation();

  const formatTime = (dateString: string) => {
    if (showFullDateTime) {
      return dayjs(dateString).format('DD/MM/YYYY HH:mm');
    }
    return dayjs(dateString).format('HH:mm');
  };

  const formatMessageText = (text: string) => {
    // URL regex pattern to match http/https URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline break-all"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div className={cn('', className)}>
      <div className={cn('mb-4', isFromUser ? 'flex justify-end' : 'flex justify-start')}>
        <div className="max-w-xs lg:max-w-md">
          <div className={cn('rounded-lg p-3 shadow-sm', isFromUser ? 'bg-green-100' : 'bg-white')}>
            {isFromUser && <div className="text-sm font-medium text-gray-700 mb-1">{t('GENERAL.YOU')}</div>}
            <div className="text-sm text-gray-800 whitespace-pre-wrap">{formatMessageText(message.text)}</div>
            <div className={cn('flex items-center mt-2 space-x-1', isFromUser ? 'justify-end' : 'justify-start')}>
              {isFromUser && (
                <div className="flex space-x-1">
                  <Icon name="svg:check" size="0.75rem" className="text-green-500" />
                  <Icon name="svg:check" size="0.75rem" className="text-green-500" />
                </div>
              )}
              <div className="text-xs text-gray-500">{formatTime(message.createdAt)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageItem;

