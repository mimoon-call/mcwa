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
  CHAT_SEND_MESSAGE,
  CHAT_UPDATE_MESSAGE_STATUS,
  CHAT_CLEAR_SEARCH,
  CHAT_CLEAR_SEARCH_DATA,
  CHAT_RESET_PAGINATION,
  CHAT_CLEAR_MESSAGES,
  CHAT_RESET,
  CHAT_SET_SELECTED_PHONE_NUMBER,
  CHAT_SET_SEARCH_VALUE,
  CHAT_UPDATE_SEARCH_PAGINATION,
  CHAT_UPDATE_MESSAGES_PAGINATION,
  CHAT_ADD_INCOMING_MESSAGE,
  CHAT_ADD_NEW_CONVERSATION,
  CHAT_LOAD_MORE_MESSAGES,
  CHAT_LOAD_MORE_CONVERSATIONS,
} from './chat.constants';
import type {
  SearchConversationsReq,
  SearchConversationsRes,
  GetConversationReq,
  GetConversationRes,
  ChatContact,
  ChatMessage,
  InstanceChat,
  SendMessageReq,
} from './chat.types';
import type { ErrorResponse } from '@services/http/types';
import isEqual from 'lodash/isEqual';

// Helper function to deduplicate messages by messageId, keeping the last occurrence
const deduplicateMessages = (messages: ChatMessage[]): ChatMessage[] => {
  const seen = new Map<string, ChatMessage>();
  
  // Process messages in order, keeping the last occurrence of each messageId
  messages.forEach((message) => {
    if (message.messageId) {
      seen.set(message.messageId, message);
    }
  });
  
  // Return messages without messageId first, then deduplicated messages
  const messagesWithoutId = messages.filter(msg => !msg.messageId);
  const deduplicatedMessages = Array.from(seen.values());
  
  return [...messagesWithoutId, ...deduplicatedMessages];
};

// Helper function to deduplicate conversations by phoneNumber, keeping the last occurrence
const deduplicateConversations = (conversations: ChatContact[]): ChatContact[] => {
  const seen = new Map<string, ChatContact>();
  
  // Process conversations in order, keeping the last occurrence of each phoneNumber
  conversations.forEach((conversation) => {
    seen.set(conversation.phoneNumber, conversation);
  });
  
  return Array.from(seen.values());
};

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

// Async function for send message
const sendMessage = async ({ fromNumber, toNumber, ...data }: SendMessageReq): Promise<void> => {
  return await Http.post<void, Omit<SendMessageReq, 'fromNumber' | 'toNumber'>>(`/conversation/${CHAT_SEND_MESSAGE}/${fromNumber}/${toNumber}`, data);
};

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
    addIncomingMessage: (state, action) => {
      const newMessage = action.payload as ChatMessage;
      const existingMessages = state[CHAT_MESSAGES_DATA] || [];

      // The filtering is already done in the component, so we can directly add the message

      // Check if message already exists by messageId
      if (newMessage.messageId) {
        const existingMessageIndex = existingMessages.findIndex((msg) => msg.messageId === newMessage.messageId);

        if (existingMessageIndex !== -1) {
          // Update existing message with new data
          state[CHAT_MESSAGES_DATA] = existingMessages.map((msg, index) => (index === existingMessageIndex ? { ...msg, ...newMessage } : msg));
        } else {
          // Add new message to the end of the array
          state[CHAT_MESSAGES_DATA] = [...existingMessages, newMessage];
        }
      } else {
        // If no messageId, just add as new message
        state[CHAT_MESSAGES_DATA] = [...existingMessages, newMessage];
      }

      // Update lastMessage and lastMessageAt in conversations list if message has createdAt and text
      if (newMessage.createdAt && newMessage.text && newMessage.text.trim()) {
        const conversations = state[CHAT_SEARCH_DATA] || [];
        const conversationIndex = conversations.findIndex(
          (conv) => conv.phoneNumber === newMessage.fromNumber || conv.phoneNumber === newMessage.toNumber
        );

        if (conversationIndex !== -1) {
          // Update the conversation with new message data
          const updatedConversation = {
            ...conversations[conversationIndex],
            lastMessage: newMessage.text!,
            lastMessageAt: newMessage.createdAt,
          };

          // Remove the conversation from its current position and add it to the top
          const remainingConversations = conversations.filter((_, index) => index !== conversationIndex);
          state[CHAT_SEARCH_DATA] = [updatedConversation, ...remainingConversations];
        }
      }
    },
    addNewConversation: (state, action) => {
      const newConversation = action.payload as Partial<ChatContact>;
      const existingConversations = state[CHAT_SEARCH_DATA] || [];

      // Check if conversation already exists
      const conversationIndex = existingConversations.findIndex(
        (conv) => conv.phoneNumber === newConversation.phoneNumber
      );

      if (conversationIndex !== -1) {
        // Update existing conversation and move to top
        const existingConversation = existingConversations[conversationIndex];
        const updatedConversation = {
          ...existingConversation,
          ...newConversation,
        };

        // Remove the conversation from its current position and add it to the top
        const remainingConversations = existingConversations.filter((_, index) => index !== conversationIndex);
        state[CHAT_SEARCH_DATA] = [updatedConversation, ...remainingConversations];
      } else {
        // Add new conversation to the top of the list (only if phoneNumber exists)
        if (newConversation.phoneNumber) {
          state[CHAT_SEARCH_DATA] = [newConversation as ChatContact, ...existingConversations];
        }
      }
    },
    updateMessageStatus: (state, action) => {
      const { messageId, status, sentAt, deliveredAt, readAt, playedAt, errorCode, errorMessage } = action.payload;
      const existingMessages = state[CHAT_MESSAGES_DATA] || [];

      // Find and update the message with the matching messageId
      const messageIndex = existingMessages.findIndex((msg) => msg.messageId === messageId);

      if (messageIndex !== -1) {
        const updatedMessage = {
          ...existingMessages[messageIndex],
          ...(status && { status }),
          ...(sentAt && { sentAt }),
          ...(deliveredAt && { deliveredAt }),
          ...(readAt && { readAt }),
          ...(playedAt && { playedAt }),
          ...(errorCode && { errorCode }),
          ...(errorMessage && { errorMessage }),
        };

        state[CHAT_MESSAGES_DATA] = existingMessages.map((msg, index) => 
          index === messageIndex ? updatedMessage : msg
        );
      }
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

        // Only update pagination if it's a new search
        if (shouldResetPagination) {
          state[CHAT_SEARCH_DATA] = deduplicateConversations(action.payload.data);
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
          state[CHAT_SEARCH_DATA] = deduplicateConversations(action.payload.data);
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
        state[CHAT_MESSAGES_DATA] = deduplicateMessages(action.payload.data);
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
        const combinedMessages = [...action.payload.data, ...existingMessages];
        state[CHAT_MESSAGES_DATA] = deduplicateMessages(combinedMessages);
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
        const combinedConversations = [...existingConversations, ...action.payload.data];
        state[CHAT_SEARCH_DATA] = deduplicateConversations(combinedConversations);
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
  [CHAT_SEND_MESSAGE]: sendMessage,
  [CHAT_LOAD_MORE_MESSAGES]: loadMoreMessages,
  [CHAT_LOAD_MORE_CONVERSATIONS]: loadMoreConversations,
  [CHAT_CLEAR_SEARCH]: chatSlice.actions.clearSearch,
  [CHAT_CLEAR_SEARCH_DATA]: chatSlice.actions.clearSearchData,
  [CHAT_RESET_PAGINATION]: chatSlice.actions.resetPagination,
  [CHAT_CLEAR_MESSAGES]: chatSlice.actions.clearMessages,
  [CHAT_RESET]: chatSlice.actions.reset,
  [CHAT_SET_SELECTED_PHONE_NUMBER]: chatSlice.actions.setSelectedPhoneNumber,
  [CHAT_SET_SEARCH_VALUE]: chatSlice.actions.setSearchValue,
  [CHAT_UPDATE_SEARCH_PAGINATION]: chatSlice.actions.updateSearchPagination,
  [CHAT_UPDATE_MESSAGES_PAGINATION]: chatSlice.actions.updateMessagesPagination,
  [CHAT_ADD_INCOMING_MESSAGE]: chatSlice.actions.addIncomingMessage,
  [CHAT_ADD_NEW_CONVERSATION]: chatSlice.actions.addNewConversation,
  [CHAT_UPDATE_MESSAGE_STATUS]: chatSlice.actions.updateMessageStatus,
};
