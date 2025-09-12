// src/client/pages/Chat/store/chat.slice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { Http } from '@services/http';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState } from '@client/store';
import {
  CHAT_GET_CONVERSATION,
  CHAT_SEND_MESSAGE,
  CHAT_UPDATE_MESSAGE_STATUS,
  CHAT_CLEAR_SEARCH_DATA,
  CHAT_RESET_PAGINATION,
  CHAT_ADD_INCOMING_MESSAGE,
  CHAT_ADD_NEW_CONVERSATION,
  CHAT_LOAD_MORE_MESSAGES,
  CHAT_LOAD_MORE_CONVERSATIONS,
  CHAT_ADD_OPTIMISTIC_MESSAGE,
  CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS,
  CHAT_SET_SELECTED_CONTACT,
  CHAT_DELETE_CONVERSATION,
  CHAT_REMOVE_CONVERSATION,
  CHAT_SEARCH_ALL_CONVERSATIONS,
  CHAT_SEARCH_CONVERSATIONS,
  CHAT_SET_SELECTED_PHONE_NUMBER,
  INSTANCE_GET_CONVERSATION,
  INSTANCE_LOAD_MORE_MESSAGES,
  INSTANCE_LOAD_MORE_CONVERSATIONS,
  CHAT_SEARCH_DATA,
  CHAT_SEARCH_PAGINATION,
  CHAT_SEARCH_VALUE,
  CHAT_EXTERNAL_FLAG,
  CHAT_MESSAGES_DATA,
  CHAT_MESSAGES_PAGINATION,
  CHAT_LOADING,
  SEARCH_LOADING,
  CHAT_ERROR,
  GLOBAL_SELECTED_CONTACT,
  GLOBAL_LAST_SEARCH_PARAMS,
  INSTANCE_SEARCH_METADATA,
  INSTANCE_SELECTED_PHONE_NUMBER,
  INSTANCE_LAST_SEARCH_PARAMS,
} from './chat.constants';
import {
  type ChatMessage,
  type GetConversationReq,
  type GetConversationRes,
  type GlobalChatContact,
  type SearchAllConversationsReq,
  type SearchAllConversationsRes,
  type SendMessageReq,
  type DeleteConversationReq,
  type DeleteConversationRes,
  type RemoveConversationReq,
  type SearchConversationsReq,
  type SearchConversationsRes,
  type ChatContact,
  type InstanceChat,
} from './chat.types';
import type { ErrorResponse } from '@services/http/types';
import { deduplicateMessages, deduplicateGlobalConversations, deduplicateInstanceConversations, addOrUpdateConversation } from './chat.utils';
import {
  handleIncomingMessage,
  handleOptimisticMessage,
  handleMessageStatusUpdate,
  handleOptimisticMessageStatusUpdate,
} from './chat-message-handler';

// Chat State Interface - combines both global and instance functionality
export interface ChatState {
  // Shared properties
  [CHAT_SEARCH_DATA]: GlobalChatContact[] | ChatContact[] | null;
  [CHAT_SEARCH_PAGINATION]:
    | Partial<Omit<SearchAllConversationsRes, 'data'>>
    | Partial<Omit<SearchConversationsRes, 'data' | 'isConnected' | 'statusCode' | 'errorMessage'>>;
  [CHAT_SEARCH_VALUE]: string;
  [CHAT_EXTERNAL_FLAG]: boolean;
  [CHAT_MESSAGES_DATA]: ChatMessage[] | null;
  [CHAT_MESSAGES_PAGINATION]: Partial<Omit<GetConversationRes, 'data'>>;
  [CHAT_LOADING]: boolean;
  [SEARCH_LOADING]: boolean;
  [CHAT_ERROR]: ErrorResponse | null;

  // Global chat specific properties
  [GLOBAL_SELECTED_CONTACT]: GlobalChatContact | null;
  [GLOBAL_LAST_SEARCH_PARAMS]: { searchValue: string } | null;

  // Instance chat specific properties
  [INSTANCE_SEARCH_METADATA]: InstanceChat | null;
  [INSTANCE_SELECTED_PHONE_NUMBER]: string | null;
  [INSTANCE_LAST_SEARCH_PARAMS]: { phoneNumber: string; searchValue: string } | null;
}

const initialState: ChatState = {
  // Shared initial state
  [CHAT_SEARCH_DATA]: null,
  [CHAT_SEARCH_PAGINATION]: { pageSize: 50, hasMore: false },
  [CHAT_SEARCH_VALUE]: '',
  [CHAT_EXTERNAL_FLAG]: false,
  [CHAT_MESSAGES_DATA]: null,
  [CHAT_MESSAGES_PAGINATION]: { pageSize: 50 },
  [CHAT_LOADING]: false,
  [SEARCH_LOADING]: false,
  [CHAT_ERROR]: null,

  // Global chat specific initial state
  [GLOBAL_SELECTED_CONTACT]: null,
  [GLOBAL_LAST_SEARCH_PARAMS]: null,

  // Instance chat specific initial state
  [INSTANCE_SEARCH_METADATA]: null,
  [INSTANCE_SELECTED_PHONE_NUMBER]: null,
  [INSTANCE_LAST_SEARCH_PARAMS]: null,
};

// Async thunk for search all conversations (Global Chat)
const searchAllConversations = createAsyncThunk(
  `${StoreEnum.globalChat}/${CHAT_SEARCH_ALL_CONVERSATIONS}`,
  async ({ page, searchValue }: SearchAllConversationsReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.globalChat]?.searchPagination || initialState.searchPagination;
      const currentSearchValue = state[StoreEnum.globalChat]?.searchValue || '';
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

// Async thunk for search conversations (Instance Chat)
const searchConversations = createAsyncThunk(
  `${StoreEnum.chat}/${CHAT_SEARCH_CONVERSATIONS}`,
  async ({ phoneNumber, page, searchValue, externalFlag }: SearchConversationsReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.chat]?.searchPagination || initialState.searchPagination;
      const currentSearchValue = state[StoreEnum.chat]?.searchValue || '';
      const data = {
        page: { ...currentPagination, ...(page || {}) },
        searchValue: searchValue !== undefined ? searchValue : currentSearchValue,
        externalFlag,
      };

      const result = await Http.post<SearchConversationsRes, typeof data>(`/conversation/${CHAT_SEARCH_CONVERSATIONS}/${phoneNumber}`, data);

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

// Async thunk for get conversation messages (Global)
const getGlobalConversation = createAsyncThunk(
  `${StoreEnum.globalChat}/${CHAT_GET_CONVERSATION}`,
  async ({ phoneNumber, withPhoneNumber, page }: GetConversationReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.globalChat]?.messagesPagination || initialState.messagesPagination;
      const data = { page: { ...currentPagination, ...(page || {}) } };

      return await Http.post<GetConversationRes, typeof data>(`/conversation/${CHAT_GET_CONVERSATION}/${phoneNumber}/${withPhoneNumber}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for get conversation messages (Instance)
const getInstanceConversation = createAsyncThunk(
  `${StoreEnum.chat}/${CHAT_GET_CONVERSATION}`,
  async ({ phoneNumber, withPhoneNumber, page }: GetConversationReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.chat]?.messagesPagination || initialState.messagesPagination;
      const data = { page: { ...currentPagination, ...(page || {}) } };

      return await Http.post<GetConversationRes, typeof data>(`/conversation/${CHAT_GET_CONVERSATION}/${phoneNumber}/${withPhoneNumber}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for loading more messages (Global)
const loadMoreGlobalMessages = createAsyncThunk(
  `${StoreEnum.globalChat}/loadMoreMessages`,
  async ({ phoneNumber, withPhoneNumber }: { phoneNumber: string; withPhoneNumber: string }, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.globalChat]?.messagesPagination || initialState.messagesPagination;
      const nextPageIndex = (currentPagination.pageIndex || 0) + 1;
      const data = { page: { ...currentPagination, pageIndex: nextPageIndex } };

      return await Http.post<GetConversationRes, typeof data>(`/conversation/${CHAT_GET_CONVERSATION}/${phoneNumber}/${withPhoneNumber}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for loading more messages (Instance)
const loadMoreInstanceMessages = createAsyncThunk(
  `${StoreEnum.chat}/loadMoreMessages`,
  async ({ phoneNumber, withPhoneNumber }: { phoneNumber: string; withPhoneNumber: string }, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.chat]?.messagesPagination || initialState.messagesPagination;
      const nextPageIndex = (currentPagination.pageIndex || 0) + 1;
      const data = { page: { ...currentPagination, pageIndex: nextPageIndex } };

      return await Http.post<GetConversationRes, typeof data>(`/conversation/${CHAT_GET_CONVERSATION}/${phoneNumber}/${withPhoneNumber}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

// Async thunk for loading more conversations (Global)
const loadMoreGlobalConversations = createAsyncThunk(
  `${StoreEnum.globalChat}/loadMoreConversations`,
  async ({ page, searchValue }: SearchAllConversationsReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentSearchValue = state[StoreEnum.globalChat]?.searchValue || '';
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

// Async thunk for loading more conversations (Instance)
const loadMoreInstanceConversations = createAsyncThunk(
  `${StoreEnum.chat}/loadMoreConversations`,
  async ({ phoneNumber, page, searchValue }: SearchConversationsReq, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentSearchValue = state[StoreEnum.chat]?.searchValue || '';
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

// Async function for delete conversation
const deleteConversation = async ({ fromNumber, toNumber }: DeleteConversationReq): Promise<DeleteConversationRes> => {
  return await Http.delete<DeleteConversationRes>(`/conversation/${CHAT_DELETE_CONVERSATION}/${fromNumber}/${toNumber}`);
};

// Chat Slice
const chatSliceReducer = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // Global chat actions
    clearGlobalSearchData: (state) => {
      state[CHAT_SEARCH_DATA] = null;
      state[CHAT_SEARCH_PAGINATION] = { pageSize: 50, hasMore: false };
    },
    resetGlobalPagination: (state) => {
      state[CHAT_SEARCH_PAGINATION] = { pageSize: 50, hasMore: false };
      state[CHAT_MESSAGES_PAGINATION] = { pageSize: 100 };
    },
    setGlobalSelectedContact: (state, action) => {
      state[GLOBAL_SELECTED_CONTACT] = action.payload;
    },
    addGlobalIncomingMessage: (state, action) => {
      handleIncomingMessage(state, CHAT_MESSAGES_DATA, CHAT_SEARCH_DATA, action.payload, true);
    },
    addGlobalNewConversation: (state, action) => {
      state[CHAT_SEARCH_DATA] = addOrUpdateConversation(state[CHAT_SEARCH_DATA] || [], action.payload, true);
    },
    updateGlobalMessageStatus: (state, action) => {
      handleMessageStatusUpdate(state, CHAT_MESSAGES_DATA, action.payload);
    },
    removeGlobalConversation: (state, action) => {
      const { fromNumber, toNumber } = action.payload as RemoveConversationReq;
      const existingConversations = (state[CHAT_SEARCH_DATA] as GlobalChatContact[]) || [];
      state[CHAT_SEARCH_DATA] = existingConversations.filter(
        (conv) =>
          !(
            (conv.instanceNumber === fromNumber && conv.phoneNumber === toNumber) ||
            (conv.instanceNumber === toNumber && conv.phoneNumber === fromNumber)
          )
      );
    },
    addGlobalOptimisticMessage: (state, action) => {
      handleOptimisticMessage(state, CHAT_MESSAGES_DATA, action.payload);
    },
    updateGlobalOptimisticMessageStatus: (state, action) => {
      handleOptimisticMessageStatusUpdate(state, CHAT_MESSAGES_DATA, action.payload);
    },

    // Instance chat actions
    setInstanceSelectedPhoneNumber: (state, action) => {
      state[INSTANCE_SELECTED_PHONE_NUMBER] = action.payload;
    },
    setExternalFlag: (state, action) => {
      state[CHAT_EXTERNAL_FLAG] = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Global chat reducers
      .addCase(searchAllConversations.pending, (state) => {
        state.searchLoading = true;
        state.error = null;
      })
      .addCase(searchAllConversations.fulfilled, (state, action) => {
        const currentSearchValue = state.searchValue || '';
        const searchValue = action.meta.arg.searchValue || currentSearchValue;
        const shouldResetPagination = !state.globalLastSearchParams || state.globalLastSearchParams.searchValue !== searchValue;

        if (shouldResetPagination) {
          state.searchData = deduplicateGlobalConversations(action.payload.data);
          state.searchPagination = {
            totalItems: action.payload.totalItems,
            hasMore: action.payload.hasMore,
            pageIndex: action.payload.pageIndex,
            pageSize: action.payload.pageSize,
            totalPages: action.payload.totalPages,
            pageSort: action.payload.pageSort,
          };
        } else {
          state.searchData = deduplicateGlobalConversations(action.payload.data);
        }

        state.searchValue = searchValue;
        state.globalLastSearchParams = { searchValue };
        state.searchLoading = false;
      })
      .addCase(searchAllConversations.rejected, (state, action) => {
        state.searchLoading = false;
        state.error = action.payload as ErrorResponse;
      })
      .addCase(getGlobalConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getGlobalConversation.fulfilled, (state, action) => {
        state.messagesData = deduplicateMessages(action.payload.data);
        state.messagesPagination = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state.loading = false;
      })
      .addCase(getGlobalConversation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as ErrorResponse;
      })
      .addCase(loadMoreGlobalMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadMoreGlobalMessages.fulfilled, (state, action) => {
        const existingMessages = state.messagesData || [];
        const combinedMessages = [...action.payload.data, ...existingMessages];
        state.messagesData = deduplicateMessages(combinedMessages);
        state.messagesPagination = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state.loading = false;
      })
      .addCase(loadMoreGlobalMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as ErrorResponse;
      })
      .addCase(loadMoreGlobalConversations.pending, (state) => {
        state.searchLoading = true;
        state.error = null;
      })
      .addCase(loadMoreGlobalConversations.fulfilled, (state, action) => {
        const existingConversations = (state.searchData as GlobalChatContact[]) || [];
        const combinedConversations = [...existingConversations, ...action.payload.data];
        state.searchData = deduplicateGlobalConversations(combinedConversations);
        state.searchPagination = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state.searchLoading = false;
      })
      .addCase(loadMoreGlobalConversations.rejected, (state, action) => {
        state.searchLoading = false;
        state.error = action.payload as ErrorResponse;
      })

      // Instance chat reducers
      .addCase(searchConversations.pending, (state) => {
        state.searchLoading = true;
        state.error = null;
      })
      .addCase(searchConversations.fulfilled, (state, action) => {
        const { phoneNumber } = action.payload as SearchConversationsRes & { isNewSearch: boolean; phoneNumber: string };
        const currentSearchValue = state.searchValue || '';
        const searchValue = action.meta.arg.searchValue || currentSearchValue;
        const isNewPhoneNumber = !state.instanceLastSearchParams || state.instanceLastSearchParams.phoneNumber !== phoneNumber;
        const isNewSearchValue = !state.instanceLastSearchParams || state.instanceLastSearchParams.searchValue !== searchValue;
        const shouldResetPagination = isNewPhoneNumber || isNewSearchValue;

        if (shouldResetPagination) {
          state.searchData = deduplicateInstanceConversations(action.payload.data);
          state.searchPagination = {
            totalItems: action.payload.totalItems,
            hasMore: action.payload.hasMore,
            pageIndex: action.payload.pageIndex,
            pageSize: action.payload.pageSize,
            totalPages: action.payload.totalPages,
            pageSort: action.payload.pageSort,
          };
        } else {
          state.searchData = deduplicateInstanceConversations(action.payload.data);
        }

        state.instanceSearchMetadata = {
          isConnected: action.payload.isConnected,
          statusCode: action.payload.statusCode,
          errorMessage: action.payload.errorMessage,
          profilePictureUrl: action.payload.profilePictureUrl,
        };

        state.searchValue = searchValue;
        state.instanceLastSearchParams = { phoneNumber, searchValue };
        state.searchLoading = false;
      })
      .addCase(searchConversations.rejected, (state, action) => {
        state.searchLoading = false;
        state.error = action.payload as ErrorResponse;
      })
      .addCase(getInstanceConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getInstanceConversation.fulfilled, (state, action) => {
        state.messagesData = deduplicateMessages(action.payload.data);
        state.messagesPagination = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state.loading = false;
      })
      .addCase(getInstanceConversation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as ErrorResponse;
      })
      .addCase(loadMoreInstanceMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadMoreInstanceMessages.fulfilled, (state, action) => {
        const existingMessages = state.messagesData || [];
        const combinedMessages = [...action.payload.data, ...existingMessages];
        state.messagesData = deduplicateMessages(combinedMessages);
        state.messagesPagination = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state.loading = false;
      })
      .addCase(loadMoreInstanceMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as ErrorResponse;
      })
      .addCase(loadMoreInstanceConversations.pending, (state) => {
        state.searchLoading = true;
        state.error = null;
      })
      .addCase(loadMoreInstanceConversations.fulfilled, (state, action) => {
        const existingConversations = state.searchData || [];
        const combinedConversations = [...existingConversations, ...action.payload.data];
        state.searchData = deduplicateInstanceConversations(combinedConversations);
        state.searchPagination = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state.searchLoading = false;
      })
      .addCase(loadMoreInstanceConversations.rejected, (state, action) => {
        state.searchLoading = false;
        state.error = action.payload as ErrorResponse;
      });
  },
});

// Export the chat slice with both global and instance functionality
export const chatSlice = {
  reducer: chatSliceReducer.reducer,
  actions: chatSliceReducer.actions,

  // Global chat async actions using constants
  [CHAT_SEARCH_ALL_CONVERSATIONS]: searchAllConversations,
  [CHAT_GET_CONVERSATION]: getGlobalConversation,
  [CHAT_LOAD_MORE_MESSAGES]: loadMoreGlobalMessages,
  [CHAT_LOAD_MORE_CONVERSATIONS]: loadMoreGlobalConversations,
  [CHAT_DELETE_CONVERSATION]: deleteConversation,

  // Instance chat async actions using constants
  [CHAT_SEARCH_CONVERSATIONS]: searchConversations,
  [INSTANCE_GET_CONVERSATION]: getInstanceConversation,
  [INSTANCE_LOAD_MORE_MESSAGES]: loadMoreInstanceMessages,
  [INSTANCE_LOAD_MORE_CONVERSATIONS]: loadMoreInstanceConversations,

  // Shared async actions using constants
  [CHAT_SEND_MESSAGE]: sendMessage,

  // Action aliases for backward compatibility using constants
  [CHAT_CLEAR_SEARCH_DATA]: chatSliceReducer.actions.clearGlobalSearchData,
  [CHAT_RESET_PAGINATION]: chatSliceReducer.actions.resetGlobalPagination,
  [CHAT_SET_SELECTED_CONTACT]: chatSliceReducer.actions.setGlobalSelectedContact,
  [CHAT_ADD_INCOMING_MESSAGE]: chatSliceReducer.actions.addGlobalIncomingMessage,
  [CHAT_ADD_NEW_CONVERSATION]: chatSliceReducer.actions.addGlobalNewConversation,
  [CHAT_UPDATE_MESSAGE_STATUS]: chatSliceReducer.actions.updateGlobalMessageStatus,
  [CHAT_REMOVE_CONVERSATION]: chatSliceReducer.actions.removeGlobalConversation,
  [CHAT_ADD_OPTIMISTIC_MESSAGE]: chatSliceReducer.actions.addGlobalOptimisticMessage,
  [CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS]: chatSliceReducer.actions.updateGlobalOptimisticMessageStatus,
  [CHAT_SET_SELECTED_PHONE_NUMBER]: chatSliceReducer.actions.setInstanceSelectedPhoneNumber,
  setExternalFlag: chatSliceReducer.actions.setExternalFlag,
};

// Default export for backward compatibility
export default chatSlice;
