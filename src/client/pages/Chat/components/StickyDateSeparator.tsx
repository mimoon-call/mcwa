import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import dayjs from '@client/locale/dayjs';
import { DateFormat } from '@client/shared/constants/date-format';
import type { ChatMessage } from '../store/chat.types';

type StickyDateSeparatorProps = {
  messages: ChatMessage[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
};

const StickyDateSeparator: React.FC<StickyDateSeparatorProps> = ({ messages, scrollContainerRef, className }) => {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);
  const separatorRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTimeRef = useRef<number>(0);

  const formatDate = (dateString: string) => {
    const messageDate = dayjs(dateString);
    const today = dayjs().startOf('day');
    const yesterday = today.subtract(1, 'day');
    const messageDateStart = messageDate.startOf('day');

    if (messageDateStart.isSame(today)) {
      return t('GENERAL.TODAY');
    } else if (messageDateStart.isSame(yesterday)) {
      return t('GENERAL.YESTERDAY');
    } else {
      return messageDate.format(DateFormat.FULL_DATE);
    }
  };

  const getMessageInViewport = () => {
    if (!scrollContainerRef.current || messages.length === 0) return null;

    const container = scrollContainerRef.current;
    const separatorRect = separatorRef.current?.getBoundingClientRect();
    if (!separatorRect) return null;

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

  const updateDate = useCallback(() => {
    const messageInView = getMessageInViewport();
    if (messageInView) {
      const newDate = formatDate((messageInView as ChatMessage).createdAt);
      setCurrentDate(newDate);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    lastScrollTimeRef.current = Date.now();

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set scrolling state
    setIsScrolling(true);

    // Update date while scrolling
    updateDate();

    // Set timeout to hide after 7 seconds of no scrolling
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
      setIsVisible(false);
    }, 3000);
  }, [updateDate]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Initial update
    updateDate();

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll, updateDate, scrollContainerRef]);

  // Determine opacity based on visibility and scrolling state
  const getOpacityClass = () => {
    if (!isVisible) return 'opacity-0';
    if (isScrolling) return 'opacity-80';
    return 'opacity-20'; // 80% opacity when visible but not scrolling
  };

  return (
    <div
      ref={separatorRef}
      className={cn('sticky top-4 z-20 flex items-center justify-center transition-opacity duration-300 ease-in-out', getOpacityClass(), className)}
    >
      <div className="bg-white border border-gray-300 rounded-full px-4 py-2 shadow-md">
        <span className="text-sm text-gray-600 font-medium">{currentDate}</span>
      </div>
    </div>
  );
};

export default StickyDateSeparator;
