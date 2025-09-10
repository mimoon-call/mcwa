import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';
import { cn } from '@client/plugins';
import dayjs from '@client/locale/dayjs';
import { DateFormat } from '@client-constants';
import type { ChatMessage } from '../store/chat.types';
import { MessageStatusEnum } from '../store/chat.types';

type MessageItemProps = {
  message: ChatMessage;
  isFromUser: boolean;
  showDate: boolean;
  showFullDateTime?: boolean;
  className?: string;
};

const ChatMessageItem: React.FC<MessageItemProps> = ({ message, isFromUser, showFullDateTime = false, className }) => {
  const { t } = useTranslation();

  const formatTime = (dateString: string) => {
    const date = dayjs(dateString);
    const now = dayjs();

    // If showFullDateTime is true, always show full date and time
    if (showFullDateTime) {
      return date.format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT);
    }

    // If the date is today, show only time
    if (date.isSame(now, 'day')) {
      return date.format(DateFormat.TIME_FORMAT);
    }

    // If the date is yesterday, show "Yesterday" with time
    if (date.isSame(now.subtract(1, 'day'), 'day')) {
      return `${t('GENERAL.YESTERDAY')} ${date.format(DateFormat.TIME_FORMAT)}`;
    }

    // For all other dates (not today or yesterday), show full date and time
    return date.format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT);
  };

  const formatMessageText = (text: string | null | undefined) => {
    // Handle null, undefined, or empty text
    if (!text) {
      return '';
    }

    // URL regex pattern to match http/https URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    const parts = text.split(urlRegex);

    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline break-all">
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const getCheckmarkStyle = (status?: string): [string, string | null] => {
    if (status === MessageStatusEnum.PENDING) return ['text-gray-500', null];
    if (status === MessageStatusEnum.ERROR) return ['text-red-500', null];
    if (status === MessageStatusEnum.DELIVERED) return ['text-gray-500', 'text-gray-500'];
    if (status === MessageStatusEnum.READ || status === MessageStatusEnum.PLAYED) return ['text-green-500', 'text-green-500'];

    return ['text-green-500', 'text-green-500'];
  };

  return !message.text ? null : (
    <div className={cn('', className)}>
      <div className={cn('mb-4', isFromUser ? 'flex justify-end' : 'flex justify-start')}>
        <div className="max-w-xs lg:max-w-md">
          <div className={cn('rounded-lg p-3 shadow-sm', isFromUser ? 'bg-green-100' : 'bg-white')}>
            {isFromUser && <div className="text-xs font-medium text-gray-500 mb-1">{t('GENERAL.YOU')}</div>}
            <div className="text-sm text-gray-900 whitespace-pre-wrap">{formatMessageText(message.text)}</div>
            <div className={cn('flex items-center mt-2 space-x-1', isFromUser ? 'justify-end' : 'justify-start')}>
              {isFromUser && (
                <div className="flex space-x-1">
                  {(() => {
                    const checkStyle = getCheckmarkStyle(message.status);
                    return (
                      <div className="pe-1 flex">
                        <Icon name="svg:check" size="0.625rem" className={checkStyle[0]} />
                        {checkStyle[1] && <Icon name="svg:check" size="0.625rem" className={cn(checkStyle[1], 'ltr:-ml-1.5 rtl:-mr-1.5')} />}
                      </div>
                    );
                  })()}
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

export default ChatMessageItem;
