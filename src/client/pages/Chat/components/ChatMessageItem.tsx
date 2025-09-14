import type { ChatMessage } from '../store/chat.types';
import React, { useState, useEffect } from 'react';
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
  retryCooldowns?: Record<string, number>;
  internalFlag?: boolean;
};

type RetryProps = Pick<ChatMessage, 'status' | 'tempId' | 'messageId'> & Pick<MessageItemProps, 'onRetry' | 'retryCooldowns'>;

const ReadIndicator = ({ status, visible }: Pick<ChatMessage, 'status'> & { visible: boolean }) => {
  if (!visible) return null;

  const [className1, className2] = ((): [string, string | null] => {
    if (status === MessageStatusEnum.PENDING) return ['text-gray-500', null];
    if (status === MessageStatusEnum.ERROR) return ['text-red-500', null];
    if (status === MessageStatusEnum.DELIVERED) return ['text-gray-500', 'text-gray-500'];
    if (status === MessageStatusEnum.READ || status === MessageStatusEnum.PLAYED) return ['text-green-500', 'text-green-500'];

    return ['text-green-500', 'text-green-500'];
  })();

  return (
    <div className="pe-1 flex">
      <Icon name="svg:check" size="0.625rem" className={className1} />
      {className2 && <Icon name="svg:check" size="0.625rem" className={cn(className2, 'ltr:-ml-1.5 rtl:-mr-1.5')} />}
    </div>
  );
};

const RetryElement = ({ status, tempId, messageId, retryCooldowns, onRetry }: RetryProps) => {
  if (!onRetry || (!tempId && status !== MessageStatusEnum.ERROR)) return null;

  const { t } = useTranslation();
  const id = tempId || messageId;
  const [iconName, setIconName] = useState<IconName>('svg:warning');
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [isRetryDisabled, setIsRetryDisabled] = useState<boolean>(false);

  // Check if this message has a retry cooldown
  const cooldownTimestamp = retryCooldowns?.[id!];
  const isOnCooldown = cooldownTimestamp && cooldownTimestamp > Date.now();

  // Update cooldown timer
  useEffect(() => {
    if (!isOnCooldown) {
      setIsRetryDisabled(false);
      setCooldownSeconds(0);
      return;
    }

    setIsRetryDisabled(true);

    const updateCooldown = () => {
      const remaining = Math.ceil((cooldownTimestamp - Date.now()) / 1000);
      if (remaining <= 0) {
        setIsRetryDisabled(false);
        setCooldownSeconds(0);
      } else {
        setCooldownSeconds(remaining);
      }
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);

    return () => clearInterval(interval);
  }, [cooldownTimestamp, isOnCooldown]);

  const getTooltipText = () => {
    if (isRetryDisabled && cooldownSeconds > 0) {
      return t('GENERAL.RETRY_COOLDOWN', { seconds: cooldownSeconds });
    }
    return t('GENERAL.RETRY');
  };

  const retryRef = useTooltip<HTMLDivElement>({ text: getTooltipText() });

  const handleRetryClick = () => {
    if (!isRetryDisabled && onRetry) {
      onRetry(id!);
    }
  };

  return (
    <div
      ref={retryRef}
      className={cn('pt-0.5 px-1', isRetryDisabled && 'cursor-not-allowed opacity-50')}
      onMouseOver={() => !isRetryDisabled && setIconName('svg:sync')}
      onMouseLeave={() => setIconName('svg:warning')}
    >
      <Icon name={iconName} size="0.75rem" className={cn('text-red-600', isRetryDisabled && 'cursor-not-allowed')} onClick={handleRetryClick} />
    </div>
  );
};

const ChatMessageItem: React.FC<MessageItemProps> = ({
  message,
  isFromUser,
  internalFlag,
  showFullDateTime = false,
  className,
  onRetry,
  retryCooldowns = {},
}) => {
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
              {isFromUser && message.status === MessageStatusEnum.ERROR && message.tempId && onRetry ? (
                <RetryElement
                  status={message.status}
                  messageId={message.messageId}
                  tempId={message.tempId}
                  retryCooldowns={retryCooldowns}
                  onRetry={onRetry}
                />
              ) : (
                <ReadIndicator visible={isFromUser || !!internalFlag} status={message.status} />
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
