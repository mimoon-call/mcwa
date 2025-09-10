// src/client/pages/Chat/store/chat.slice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { Http } from '@services/http';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState } from '@client/store';
import {
  CHAT_ERROR,
  CHAT_GET_CONVERSATION,
  CHAT_LOADING,
  CHAT_MESSAGES_DATA,
  CHAT_MESSAGES_PAGINATION,
  CHAT_SEARCH_ALL_CONVERSATIONS,
  CHAT_SEARCH_DATA,
  CHAT_SEARCH_PAGINATION,
  CHAT_SEARCH_VALUE,
  CHAT_SELECTED_CONTACT,
  SEARCH_LOADING,
} from './chat.constants';
import type {
  ChatMessage,
  GetConversationReq,
  GetConversationRes,
  GlobalChatContact,
  SearchAllConversationsReq,
  SearchAllConversationsRes,
} from './chat.types';
import type { ErrorResponse } from '@services/http/types';
import isEqual from 'lodash/isEqual';

export interface GlobalChatState {
  [CHAT_SEARCH_DATA]: GlobalChatContact[] | null;
  [CHAT_SEARCH_PAGINATION]: Partial<Omit<SearchAllConversationsRes, 'data'>>;
  [CHAT_SEARCH_VALUE]: string;
  [CHAT_MESSAGES_DATA]: ChatMessage[] | null;
  [CHAT_MESSAGES_PAGINATION]: Partial<Omit<GetConversationRes, 'data'>>;
  [CHAT_SELECTED_CONTACT]: GlobalChatContact | null;
  [CHAT_LOADING]: boolean;
  [SEARCH_LOADING]: boolean;
  [CHAT_ERROR]: ErrorResponse | null;
  lastSearchParams: { searchValue: string } | null;
}

const initialState: GlobalChatState = {
  [CHAT_SEARCH_DATA]: null,
  [CHAT_SEARCH_PAGINATION]: { pageSize: 50, hasMore: false },
  [CHAT_SEARCH_VALUE]: '',
  [CHAT_MESSAGES_DATA]: null,
  [CHAT_MESSAGES_PAGINATION]: { pageSize: 50 },
  [CHAT_SELECTED_CONTACT]: null,
  [CHAT_LOADING]: false,
  [SEARCH_LOADING]: false,
  [CHAT_ERROR]: null,
  lastSearchParams: null,
};

// Async thunk for search all conversations
const searchAllConversations = createAsyncThunk(
  `${StoreEnum.globalChat}/${CHAT_SEARCH_ALL_CONVERSATIONS}`,
  async ({ page, searchValue }: SearchAllConversationsReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.globalChat]?.[CHAT_SEARCH_PAGINATION] || initialState[CHAT_SEARCH_PAGINATION];
      const currentSearchValue = state[StoreEnum.globalChat]?.[CHAT_SEARCH_VALUE] || '';
      const data = {
        page: { ...currentPagination, ...(page || {}) },
        searchValue: searchValue !== undefined ? searchValue : currentSearchValue,
      };

      const result = await Http.post<SearchAllConversationsRes, typeof data>(`/conversation/${CHAT_SEARCH_ALL_CONVERSATIONS}`, data);

      return {
        ...result,
        isNewSearch: searchValue !== currentSearchValue,
      };
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for get conversation messages
const getConversation = createAsyncThunk(
  `${StoreEnum.globalChat}/${CHAT_GET_CONVERSATION}`,
  async ({ phoneNumber, withPhoneNumber, page }: GetConversationReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.globalChat]?.[CHAT_MESSAGES_PAGINATION] || initialState[CHAT_MESSAGES_PAGINATION];
      const data = { page: { ...currentPagination, ...(page || {}) } };

      return await Http.post<GetConversationRes, typeof data>(`/conversation/${CHAT_GET_CONVERSATION}/${phoneNumber}/${withPhoneNumber}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for loading more messages (for infinite scroll)
const loadMoreMessages = createAsyncThunk(
  `${StoreEnum.globalChat}/loadMoreMessages`,
  async ({ phoneNumber, withPhoneNumber }: { phoneNumber: string; withPhoneNumber: string }, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.globalChat]?.[CHAT_MESSAGES_PAGINATION] || initialState[CHAT_MESSAGES_PAGINATION];
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
  `${StoreEnum.globalChat}/loadMoreConversations`,
  async ({ page, searchValue }: SearchAllConversationsReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentSearchValue = state[StoreEnum.globalChat]?.[CHAT_SEARCH_VALUE] || '';
      const data = {
        page,
        searchValue: searchValue !== undefined ? searchValue : currentSearchValue,
      };

      return await Http.post<SearchAllConversationsRes, typeof data>(`/conversation/${CHAT_SEARCH_ALL_CONVERSATIONS}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

const globalChatSlice = createSlice({
  name: StoreEnum.globalChat,
  initialState,
  reducers: {
    clearSearch: (state) => {
      state[CHAT_SEARCH_DATA] = null;
      state[CHAT_SEARCH_VALUE] = '';
      state[CHAT_SEARCH_PAGINATION] = initialState[CHAT_SEARCH_PAGINATION];
    },
    clearSearchData: (state) => {
      state[CHAT_SEARCH_DATA] = null;
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
      state[CHAT_SEARCH_VALUE] = initialState[CHAT_SEARCH_VALUE];
      state[CHAT_MESSAGES_PAGINATION] = initialState[CHAT_MESSAGES_PAGINATION];
      state[CHAT_SELECTED_CONTACT] = null;
    },
    setSelectedContact: (state, action) => {
      state[CHAT_SELECTED_CONTACT] = action.payload;
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
      // Search all conversations
      .addCase(searchAllConversations.pending, (state) => {
        state[SEARCH_LOADING] = true;
        state[CHAT_ERROR] = null;
      })
      .addCase(searchAllConversations.fulfilled, (state, action) => {
        const currentSearchValue = state[CHAT_SEARCH_VALUE] || '';
        const searchValue = action.meta.arg.searchValue || currentSearchValue;

        // Check if this is a new search (different search value)
        const shouldResetPagination = !state.lastSearchParams || state.lastSearchParams.searchValue !== searchValue;

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

        // Update search value in state
        state[CHAT_SEARCH_VALUE] = searchValue;

        // Update last search params
        state.lastSearchParams = {
          searchValue,
        };

        state[SEARCH_LOADING] = false;
      })
      .addCase(searchAllConversations.rejected, (state, action) => {
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
  reducer: globalChatSlice.reducer,
  [CHAT_SEARCH_ALL_CONVERSATIONS]: searchAllConversations,
  [CHAT_GET_CONVERSATION]: getConversation,
  loadMoreMessages,
  loadMoreConversations,
  clearSearch: globalChatSlice.actions.clearSearch,
  clearSearchData: globalChatSlice.actions.clearSearchData,
  resetPagination: globalChatSlice.actions.resetPagination,
  clearMessages: globalChatSlice.actions.clearMessages,
  reset: globalChatSlice.actions.reset,
  setSelectedContact: globalChatSlice.actions.setSelectedContact,
  setSearchValue: globalChatSlice.actions.setSearchValue,
  updateSearchPagination: globalChatSlice.actions.updateSearchPagination,
  updateMessagesPagination: globalChatSlice.actions.updateMessagesPagination,
};
