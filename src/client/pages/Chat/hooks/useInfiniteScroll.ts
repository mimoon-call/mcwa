import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@client/store';
import { StoreEnum } from '@client/store/store.enum';
import { CHAT_MESSAGES_DATA } from '../store/chat.constants';
import chatSlice from '../store/chat.slice';

type UseInfiniteScrollProps = {
  phoneNumber?: string;
  withPhoneNumber?: string;
  hasMore: boolean;
  loading: boolean;
  threshold?: number; // Distance from top to trigger load more (in pixels)
};

export const useInfiniteScroll = ({
  phoneNumber,
  withPhoneNumber,
  hasMore,
  loading,
  threshold = 100,
}: UseInfiniteScrollProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const isScrollableRef = useRef(false);
  
  // Get current messages to detect when new ones are added
  const messages = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_MESSAGES_DATA]) || [];

  const loadMoreMessages = useCallback(() => {
    if (!phoneNumber || !withPhoneNumber || loading || isLoadingMoreRef.current || !hasMore) {
      return;
    }

    const container = scrollContainerRef.current;
    if (container && isScrollableRef.current) {
      // Only save scroll position if container is scrollable
      previousScrollHeightRef.current = container.scrollHeight;
      previousScrollTopRef.current = container.scrollTop;
    }

    isLoadingMoreRef.current = true;
    dispatch(chatSlice.loadMoreMessages({ phoneNumber, withPhoneNumber }))
      .finally(() => {
        isLoadingMoreRef.current = false;
      });
  }, [dispatch, phoneNumber, withPhoneNumber, loading, hasMore]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop } = container;
    
    // Check if user is near the top (for reversed infinite scroll)
    if (scrollTop <= threshold && hasMore && !loading && !isLoadingMoreRef.current) {
      loadMoreMessages();
    }
  }, [loadMoreMessages, hasMore, loading, threshold]);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  const scrollToBottomSmooth = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Handle scroll position restoration after loading more messages
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Use setTimeout to ensure DOM is fully updated
    const timeoutId = setTimeout(() => {
      // Check if container is scrollable (content height > container height)
      const isScrollable = container.scrollHeight > container.clientHeight;
      
      if (isInitialLoadRef.current) {
        // On initial load, always scroll to bottom until we have scrollable content
        if (messages.length > 0) {
          scrollToBottom();
          isScrollableRef.current = isScrollable;
          if (isScrollable) {
            isInitialLoadRef.current = false;
          }
        }
        return;
      }

      // After initial load phase, check if we're now scrollable
      if (!isScrollableRef.current && isScrollable) {
        // Just became scrollable, scroll to bottom and mark as scrollable
        scrollToBottom();
        isScrollableRef.current = true;
        return;
      }

      // If we have saved scroll positions and new messages were loaded (and container is scrollable)
      if (isScrollableRef.current && previousScrollHeightRef.current > 0 && previousScrollTopRef.current > 0) {
        const newScrollHeight = container.scrollHeight;
        const heightDifference = newScrollHeight - previousScrollHeightRef.current;
        
        // Restore scroll position by adjusting for the new content height
        container.scrollTop = previousScrollTopRef.current + heightDifference;
        
        // Reset saved positions
        previousScrollHeightRef.current = 0;
        previousScrollTopRef.current = 0;
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [messages.length, scrollToBottom]);

  return {
    scrollContainerRef,
    scrollToBottom,
    scrollToBottomSmooth,
    loadMoreMessages,
  };
};
