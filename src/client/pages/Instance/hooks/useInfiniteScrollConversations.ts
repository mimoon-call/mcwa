import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@client/store';
import { StoreEnum } from '@client/store/store.enum';
import { INSTANCE_LOAD_MORE_CONVERSATIONS, CHAT_SEARCH_DATA, CHAT_SEARCH_PAGINATION } from '../../Chat/store/chat.constants';
import { chatSlice } from '../../Chat/store/chat.slice';

type UseInfiniteScrollConversationsProps = {
  phoneNumber?: string;
  hasMore: boolean;
  loading: boolean;
  threshold?: number; // Distance from bottom to trigger load more (in pixels)
  minimumItems?: number; // Minimum items to load before stopping automatic loading
};

export const useInfiniteScrollConversations = ({
  phoneNumber,
  hasMore,
  loading,
  threshold = 100,
  minimumItems = 20,
}: UseInfiniteScrollConversationsProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const hasInitialLoadedRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  const lastPhoneNumberRef = useRef<string | undefined>(phoneNumber);
  const requestCountRef = useRef(0);
  const maxRequestsRef = useRef(10); // Circuit breaker - max 10 requests per session

  // Get current conversations to detect when new ones are added
  const conversations = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_DATA]) || [];
  const pagination = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_PAGINATION]);

  const loadMoreConversations = useCallback(() => {
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTimeRef.current;

    // Circuit breaker - stop if we've made too many requests
    if (requestCountRef.current >= maxRequestsRef.current) {
      return;
    }

    if (!phoneNumber || loading || isLoadingMoreRef.current || !hasMore || timeSinceLastLoad < 1000) {
      return;
    }

    requestCountRef.current += 1;
    isLoadingMoreRef.current = true;
    lastLoadTimeRef.current = now;
    const nextPageIndex = (pagination.pageIndex || 0) + 1;

    dispatch(
      chatSlice[INSTANCE_LOAD_MORE_CONVERSATIONS]({
        phoneNumber,
        page: {
          ...pagination,
          pageIndex: nextPageIndex,
        },
      })
    ).finally(() => {
      isLoadingMoreRef.current = false;
    });
  }, [dispatch, phoneNumber, loading, hasMore, pagination]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Check if user is near the bottom
    if (distanceFromBottom <= threshold && hasMore && !loading && !isLoadingMoreRef.current) {
      loadMoreConversations();
    }
  }, [loadMoreConversations, hasMore, loading, threshold]);

  // Reset initial loading state when phone number changes
  useEffect(() => {
    if (lastPhoneNumberRef.current !== phoneNumber) {
      hasInitialLoadedRef.current = false;
      lastPhoneNumberRef.current = phoneNumber;
    }
  }, [phoneNumber]);

  // Auto-load more conversations until we have minimum items or no more data
  useEffect(() => {
    // Only run auto-loading if we haven't completed initial loading
    if (hasInitialLoadedRef.current) {
      return;
    }

    // Don't auto-load if we're still loading the initial search
    if (loading) {
      return;
    }

    if (phoneNumber && hasMore && conversations.length > 0) {
      const currentCount = conversations.length;

      if (currentCount < minimumItems) {
        // Auto-load more if we don't have enough items
        loadMoreConversations();
      } else {
        hasInitialLoadedRef.current = true;
      }
    } else if (conversations.length >= minimumItems || !hasMore) {
      hasInitialLoadedRef.current = true;
    }
  }, [conversations.length, phoneNumber, loading, hasMore, minimumItems, loadMoreConversations]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasMore) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll, hasMore]);

  return {
    scrollContainerRef,
    loadMoreConversations,
  };
};
