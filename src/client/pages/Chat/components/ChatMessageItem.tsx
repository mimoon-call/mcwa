import type { ChatMessage } from '../store/chat.types';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';
import { cn } from '@client/plugins';
import { MessageStatusEnum } from '../store/chat.enum';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';
import { formatTime } from '../helpers';
import { useTooltip } from '@hooks';
import type { IconName } from '@components/Icon/Icon.type';

type MessageItemProps = {
  message: ChatMessage;
  isFromUser: boolean;
  showDate: boolean;
  showFullDateTime?: boolean;
  className?: string;
  onRetry?: (tempId: string) => void;
};

const ChatMessageItem: React.FC<MessageItemProps> = ({ message, isFromUser, showFullDateTime = false, className, onRetry }) => {
  const { t } = useTranslation();

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

  const retryElement = (() => {
    if (!onRetry || (!message.tempId && message.status !== MessageStatusEnum.ERROR)) return null;

    const id = message.tempId || message.messageId;
    const retryRef = useTooltip<HTMLDivElement>({ text: t('GENERAL.RETRY') });
    const [iconName, setIconName] = useState<IconName>('svg:warning');

    return (
      <div ref={retryRef} className="pt-0.5 px-1" onMouseOver={() => setIconName('svg:sync')} onMouseLeave={() => setIconName('svg:warning')}>
        <Icon name={iconName} size="0.75rem" className="text-red-600" onClick={() => onRetry(id!)} />
      </div>
    );
  })();

  return !message.text ? null : (
    <div className={cn('', className)} data-message-id={message.messageId || message.tempId}>
      <div className={cn('mb-4', isFromUser ? 'flex justify-end' : 'flex justify-start')}>
        <div className="max-w-xs lg:max-w-md">
          <div className={cn('rounded-lg p-3 shadow-sm', isFromUser ? 'bg-green-100' : 'bg-white')}>
            {isFromUser && (
              <div className="flex gap-1 text-xs font-medium text-gray-500 mb-1">
                <span>{t('GENERAL.YOU')}</span>
                <span dir="ltr">({internationalPhonePrettier(message.fromNumber, '-', true)})</span>
              </div>
            )}
            <div className="text-sm text-gray-900 whitespace-pre-wrap">{formatMessageText(message.text)}</div>
            <div className={cn('flex items-center mt-2 space-x-1', isFromUser ? 'justify-end' : 'justify-start')}>
              {isFromUser && (
                <div className="flex space-x-1">
                  {(message.status === MessageStatusEnum.ERROR || message.tempId) && onRetry
                    ? retryElement
                    : (() => {
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
              <div className="text-xs text-gray-500">{formatTime(message.createdAt, t, showFullDateTime)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessageItem;
