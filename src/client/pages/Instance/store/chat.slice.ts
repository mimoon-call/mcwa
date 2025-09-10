// src/client/pages/Chat/store/chat.slice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { Http } from '@services/http';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState } from '@client/store';
import {
  CHAT_SEARCH_CONVERSATIONS,
  CHAT_GET_CONVERSATION,
  CHAT_SEARCH_DATA,
  CHAT_SEARCH_PAGINATION,
  CHAT_SEARCH_METADATA,
  CHAT_SEARCH_VALUE,
  CHAT_MESSAGES_DATA,
  CHAT_MESSAGES_PAGINATION,
  CHAT_LOADING,
  SEARCH_LOADING,
  CHAT_ERROR,
  CHAT_SELECTED_PHONE_NUMBER,
} from './chat.constants';
import type {
  SearchConversationsReq,
  SearchConversationsRes,
  GetConversationReq,
  GetConversationRes,
  ChatContact,
  ChatMessage,
  InstanceChat,
} from './chat.types';
import type { ErrorResponse } from '@services/http/types';
import isEqual from 'lodash/isEqual';

export interface ChatState {
  [CHAT_SEARCH_DATA]: ChatContact[] | null;
  [CHAT_SEARCH_PAGINATION]: Partial<Omit<SearchConversationsRes, 'data' | 'isConnected' | 'statusCode' | 'errorMessage'>>;
  [CHAT_SEARCH_METADATA]: InstanceChat | null;
  [CHAT_SEARCH_VALUE]: string;
  [CHAT_MESSAGES_DATA]: ChatMessage[] | null;
  [CHAT_MESSAGES_PAGINATION]: Partial<Omit<GetConversationRes, 'data'>>;
  [CHAT_SELECTED_PHONE_NUMBER]: string | null;
  [CHAT_LOADING]: boolean;
  [SEARCH_LOADING]: boolean;
  [CHAT_ERROR]: ErrorResponse | null;
  lastSearchParams: { phoneNumber: string; searchValue: string } | null;
}

const initialState: ChatState = {
  [CHAT_SEARCH_DATA]: null,
  [CHAT_SEARCH_PAGINATION]: { pageSize: 50, hasMore: false },
  [CHAT_SEARCH_METADATA]: null,
  [CHAT_SEARCH_VALUE]: '',
  [CHAT_MESSAGES_DATA]: null,
  [CHAT_MESSAGES_PAGINATION]: { pageSize: 50 },
  [CHAT_SELECTED_PHONE_NUMBER]: null,
  [CHAT_LOADING]: false,
  [SEARCH_LOADING]: false,
  [CHAT_ERROR]: null,
  lastSearchParams: null,
};

// Async thunk for search conversations
const searchConversations = createAsyncThunk(
  `${StoreEnum.chat}/${CHAT_SEARCH_CONVERSATIONS}`,
  async ({ phoneNumber, page, searchValue }: SearchConversationsReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.chat]?.[CHAT_SEARCH_PAGINATION] || initialState[CHAT_SEARCH_PAGINATION];
      const currentSearchValue = state[StoreEnum.chat]?.[CHAT_SEARCH_VALUE] || '';
      const data = {
        page: { ...currentPagination, ...(page || {}) },
        searchValue: searchValue !== undefined ? searchValue : currentSearchValue,
      };

      const result = await Http.post<SearchConversationsRes, typeof data>(`/conversation/${CHAT_SEARCH_CONVERSATIONS}/${phoneNumber}`, data);

      // Add metadata to track if this is a new search
      return {
        ...result,
        isNewSearch: searchValue !== currentSearchValue,
        phoneNumber,
      };
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for get conversation messages
const getConversation = createAsyncThunk(
  `${StoreEnum.chat}/${CHAT_GET_CONVERSATION}`,
  async ({ phoneNumber, withPhoneNumber, page }: GetConversationReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.chat]?.[CHAT_MESSAGES_PAGINATION] || initialState[CHAT_MESSAGES_PAGINATION];
      const data = { page: { ...currentPagination, ...(page || {}) } };

      return await Http.post<GetConversationRes, typeof data>(`/conversation/${CHAT_GET_CONVERSATION}/${phoneNumber}/${withPhoneNumber}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for loading more messages (for infinite scroll)
const loadMoreMessages = createAsyncThunk(
  `${StoreEnum.chat}/loadMoreMessages`,
  async ({ phoneNumber, withPhoneNumber }: { phoneNumber: string; withPhoneNumber: string }, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.chat]?.[CHAT_MESSAGES_PAGINATION] || initialState[CHAT_MESSAGES_PAGINATION];
      const nextPageIndex = (currentPagination.pageIndex || 0) + 1;
      const data = { page: { ...currentPagination, pageIndex: nextPageIndex } };

      return await Http.post<GetConversationRes, typeof data>(`/conversation/${CHAT_GET_CONVERSATION}/${phoneNumber}/${withPhoneNumber}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for loading more conversations (for infinite scroll)
const loadMoreConversations = createAsyncThunk(
  `${StoreEnum.chat}/loadMoreConversations`,
  async ({ phoneNumber, page, searchValue }: SearchConversationsReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentSearchValue = state[StoreEnum.chat]?.[CHAT_SEARCH_VALUE] || '';
      const data = {
        page,
        searchValue: searchValue !== undefined ? searchValue : currentSearchValue,
      };

      return await Http.post<SearchConversationsRes, typeof data>(`/conversation/${CHAT_SEARCH_CONVERSATIONS}/${phoneNumber}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

const chatSlice = createSlice({
  name: StoreEnum.chat,
  initialState,
  reducers: {
    clearSearch: (state) => {
      state[CHAT_SEARCH_DATA] = null;
      state[CHAT_SEARCH_METADATA] = null;
      state[CHAT_SEARCH_VALUE] = '';
      state[CHAT_SEARCH_PAGINATION] = initialState[CHAT_SEARCH_PAGINATION];
    },
    clearSearchData: (state) => {
      state[CHAT_SEARCH_DATA] = null;
      state[CHAT_SEARCH_METADATA] = null;
      state[CHAT_SEARCH_VALUE] = '';
      // Don't reset pagination - keep hasMore state
    },
    resetPagination: (state) => {
      state[CHAT_SEARCH_PAGINATION] = initialState[CHAT_SEARCH_PAGINATION];
    },
    clearMessages: (state) => {
      state[CHAT_MESSAGES_DATA] = null;
    },
    reset: (state) => {
      state[CHAT_SEARCH_PAGINATION] = initialState[CHAT_SEARCH_PAGINATION];
      state[CHAT_SEARCH_METADATA] = initialState[CHAT_SEARCH_METADATA];
      state[CHAT_SEARCH_VALUE] = initialState[CHAT_SEARCH_VALUE];
      state[CHAT_MESSAGES_PAGINATION] = initialState[CHAT_MESSAGES_PAGINATION];
      state[CHAT_SELECTED_PHONE_NUMBER] = null;
    },
    setSelectedPhoneNumber: (state, action) => {
      state[CHAT_SELECTED_PHONE_NUMBER] = action.payload;
    },
    setSearchValue: (state, action) => {
      state[CHAT_SEARCH_VALUE] = action.payload;
    },
    updateSearchPagination: (state, action) => {
      const newPagination = { ...state[CHAT_SEARCH_PAGINATION], ...action.payload };

      if (isEqual(newPagination, state[CHAT_SEARCH_PAGINATION])) {
        return;
      }

      state[CHAT_SEARCH_PAGINATION] = newPagination;
    },
    updateMessagesPagination: (state, action) => {
      const newPagination = { ...state[CHAT_MESSAGES_PAGINATION], ...action.payload };

      if (isEqual(newPagination, state[CHAT_MESSAGES_PAGINATION])) {
        return;
      }

      state[CHAT_MESSAGES_PAGINATION] = newPagination;
    },
  },
  extraReducers: (builder) => {
    builder
      // Search conversations
      .addCase(searchConversations.pending, (state) => {
        state[SEARCH_LOADING] = true;
        state[CHAT_ERROR] = null;
      })
      .addCase(searchConversations.fulfilled, (state, action) => {
        const { phoneNumber } = action.payload as SearchConversationsRes & { isNewSearch: boolean; phoneNumber: string };
        const currentSearchValue = state[CHAT_SEARCH_VALUE] || '';
        const searchValue = action.meta.arg.searchValue || currentSearchValue;

        // Check if this is a new search (different phone number or search value)
        const isNewPhoneNumber = !state.lastSearchParams || state.lastSearchParams.phoneNumber !== phoneNumber;
        const isNewSearchValue = !state.lastSearchParams || state.lastSearchParams.searchValue !== searchValue;
        const shouldResetPagination = isNewPhoneNumber || isNewSearchValue;

        state[CHAT_SEARCH_DATA] = action.payload.data;

        // Only update pagination if it's a new search
        if (shouldResetPagination) {
          state[CHAT_SEARCH_PAGINATION] = {
            totalItems: action.payload.totalItems,
            hasMore: action.payload.hasMore,
            pageIndex: action.payload.pageIndex,
            pageSize: action.payload.pageSize,
            totalPages: action.payload.totalPages,
            pageSort: action.payload.pageSort,
          };
        } else {
          // Keep existing pagination but update data
          state[CHAT_SEARCH_DATA] = action.payload.data;
        }

        state[CHAT_SEARCH_METADATA] = {
          isConnected: action.payload.isConnected,
          statusCode: action.payload.statusCode,
          errorMessage: action.payload.errorMessage,
          profilePictureUrl: action.payload.profilePictureUrl,
        };

        // Update search value in state
        state[CHAT_SEARCH_VALUE] = searchValue;

        // Update last search params
        state.lastSearchParams = {
          phoneNumber,
          searchValue,
        };

        state[SEARCH_LOADING] = false;
      })
      .addCase(searchConversations.rejected, (state, action) => {
        state[SEARCH_LOADING] = false;
        state[CHAT_ERROR] = action.payload as ErrorResponse;
      })
      // Get conversation messages
      .addCase(getConversation.pending, (state) => {
        state[CHAT_LOADING] = true;
        state[CHAT_ERROR] = null;
      })
      .addCase(getConversation.fulfilled, (state, action) => {
        state[CHAT_MESSAGES_DATA] = action.payload.data;
        state[CHAT_MESSAGES_PAGINATION] = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state[CHAT_LOADING] = false;
      })
      .addCase(getConversation.rejected, (state, action) => {
        state[CHAT_LOADING] = false;
        state[CHAT_ERROR] = action.payload as ErrorResponse;
      })
      // Load more messages
      .addCase(loadMoreMessages.pending, (state) => {
        state[CHAT_LOADING] = true;
        state[CHAT_ERROR] = null;
      })
      .addCase(loadMoreMessages.fulfilled, (state, action) => {
        // Append new messages to existing ones (for infinite scroll)
        const existingMessages = state[CHAT_MESSAGES_DATA] || [];
        state[CHAT_MESSAGES_DATA] = [...action.payload.data, ...existingMessages];
        state[CHAT_MESSAGES_PAGINATION] = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state[CHAT_LOADING] = false;
      })
      .addCase(loadMoreMessages.rejected, (state, action) => {
        state[CHAT_LOADING] = false;
        state[CHAT_ERROR] = action.payload as ErrorResponse;
      })
      // Load more conversations
      .addCase(loadMoreConversations.pending, (state) => {
        state[SEARCH_LOADING] = true;
        state[CHAT_ERROR] = null;
      })
      .addCase(loadMoreConversations.fulfilled, (state, action) => {
        // Append new conversations to existing ones (for infinite scroll)
        const existingConversations = state[CHAT_SEARCH_DATA] || [];
        state[CHAT_SEARCH_DATA] = [...existingConversations, ...action.payload.data];
        state[CHAT_SEARCH_PAGINATION] = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state[SEARCH_LOADING] = false;
      })
      .addCase(loadMoreConversations.rejected, (state, action) => {
        state[SEARCH_LOADING] = false;
        state[CHAT_ERROR] = action.payload as ErrorResponse;
      });
  },
});

export default {
  reducer: chatSlice.reducer,
  [CHAT_SEARCH_CONVERSATIONS]: searchConversations,
  [CHAT_GET_CONVERSATION]: getConversation,
  loadMoreMessages,
  loadMoreConversations,
  clearSearch: chatSlice.actions.clearSearch,
  clearSearchData: chatSlice.actions.clearSearchData,
  resetPagination: chatSlice.actions.resetPagination,
  clearMessages: chatSlice.actions.clearMessages,
  reset: chatSlice.actions.reset,
  setSelectedPhoneNumber: chatSlice.actions.setSelectedPhoneNumber,
  setSearchValue: chatSlice.actions.setSearchValue,
  updateSearchPagination: chatSlice.actions.updateSearchPagination,
  updateMessagesPagination: chatSlice.actions.updateMessagesPagination,
};
