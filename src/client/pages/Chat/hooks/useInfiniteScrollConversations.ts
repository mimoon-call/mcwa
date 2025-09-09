import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@client/store';
import { StoreEnum } from '@client/store/store.enum';
import { CHAT_SEARCH_DATA, CHAT_SEARCH_PAGINATION } from '../store/chat.constants';
import chatSlice from '../store/chat.slice';

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
  
  // Get current conversations to detect when new ones are added
  const conversations = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_DATA]) || [];
  const pagination = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_PAGINATION]);

  const loadMoreConversations = useCallback(() => {
    if (!phoneNumber || loading || isLoadingMoreRef.current || !hasMore) {
      return;
    }

    isLoadingMoreRef.current = true;
    const nextPageIndex = (pagination.pageIndex || 0) + 1;
    
    dispatch(chatSlice.loadMoreConversations({ 
      phoneNumber, 
      page: { 
        ...pagination, 
        pageIndex: nextPageIndex 
      } 
    }))
      .finally(() => {
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

  // Auto-load more conversations until we have minimum items or no more data
  useEffect(() => {
    if (!hasInitialLoadedRef.current && phoneNumber && !loading && hasMore) {
      const currentCount = conversations.length;
      
      if (currentCount < minimumItems) {
        // Auto-load more if we don't have enough items
        loadMoreConversations();
      } else {
        hasInitialLoadedRef.current = true;
      }
    } else if (conversations.length >= minimumItems) {
      hasInitialLoadedRef.current = true;
    }
  }, [conversations.length, phoneNumber, loading, hasMore, minimumItems, loadMoreConversations]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return {
    scrollContainerRef,
    loadMoreConversations,
  };
};
