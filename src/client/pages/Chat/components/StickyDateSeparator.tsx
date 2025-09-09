import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import type { ChatMessage } from '../store/chat.types';

type StickyDateSeparatorProps = {
  messages: ChatMessage[];
  className?: string;
};

const StickyDateSeparator: React.FC<StickyDateSeparatorProps> = ({
  messages,
  className,
}) => {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const separatorRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === today.getTime()) {
      return t('GENERAL.TODAY');
    } else if (messageDate.getTime() === today.getTime() - 24 * 60 * 60 * 1000) {
      return t('GENERAL.YESTERDAY');
    } else {
      return date.toLocaleDateString('en-GB');
    }
  };

  const getMessageInViewport = () => {
    if (!separatorRef.current || messages.length === 0) return null;

    const container = separatorRef.current.parentElement;
    if (!container) return null;

    const separatorRect = separatorRef.current.getBoundingClientRect();
    
    // Find the message that's closest to the separator position
    const messageElements = container.querySelectorAll('[data-message-index]');
    let closestMessage: ChatMessage | null = null;
    let minDistance = Infinity;

    messageElements.forEach((element) => {
      const elementRect = element.getBoundingClientRect();
      const distance = Math.abs(elementRect.top - separatorRect.top);
      
      if (distance < minDistance) {
        minDistance = distance;
        const index = parseInt(element.getAttribute('data-message-index') || '0');
        if (messages[index]) {
          closestMessage = messages[index];
        }
      }
    });

    return closestMessage;
  };

  const updateDate = () => {
    const messageInView = getMessageInViewport();
    if (messageInView) {
      const newDate = formatDate((messageInView as ChatMessage).createdAt);
      setCurrentDate(newDate);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  useEffect(() => {
    const container = separatorRef.current?.parentElement;
    if (!container) return;

    const handleScroll = () => {
      updateDate();
    };

    // Initial update
    updateDate();

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages]);

  return (
    <div
      ref={separatorRef}
      className={cn(
        'sticky top-4 z-20 flex items-center justify-center transition-opacity duration-200',
        isVisible ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      <div className="bg-white border border-gray-300 rounded-full px-4 py-2 shadow-lg">
        <span className="text-sm text-gray-600 font-medium">{currentDate}</span>
      </div>
    </div>
  );
};

export default StickyDateSeparator;
