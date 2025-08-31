import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { StoreEnum } from '@client/store/store.enum';
import type { ErrorResponse } from '@services/http/types';
import {
  ADD_MESSAGE_QUEUE,
  DELETE_MESSAGE_QUEUE,
  MESSAGE_QUEUE_COUNT,
  MESSAGE_QUEUE_DATA,
  MESSAGE_QUEUE_ERROR,
  MESSAGE_QUEUE_LOADING,
  MESSAGE_QUEUE_PAGINATION,
  REMOVE_MESSAGE_QUEUE,
  SEARCH_MESSAGE_QUEUE,
  UPDATE_MESSAGE_COUNT,
  UPDATE_MESSAGE_QUEUE,
} from '@client/pages/MessageQueue/store/message-queue.constants';
import type { AddMessageQueueReq, SearchMessageQueueReq, SearchMessageQueueRes } from '@client/pages/MessageQueue/store/message-queue.types';
import type { RootState } from '@client/store';
import { Http } from '@services/http';

export interface MessageQueueState {
  [MESSAGE_QUEUE_COUNT]: number;
  [MESSAGE_QUEUE_DATA]: SearchMessageQueueRes['data'] | null;
  [MESSAGE_QUEUE_PAGINATION]: Partial<Omit<SearchMessageQueueRes, 'data'>>;
  [MESSAGE_QUEUE_LOADING]: boolean;
  [MESSAGE_QUEUE_ERROR]: ErrorResponse | null;
}

const initialState: MessageQueueState = {
  [MESSAGE_QUEUE_COUNT]: 0,
  [MESSAGE_QUEUE_DATA]: null,
  [MESSAGE_QUEUE_PAGINATION]: { pageSize: 30 },
  [MESSAGE_QUEUE_LOADING]: false,
  [MESSAGE_QUEUE_ERROR]: null,
};

const searchMessageQueue = createAsyncThunk(
  `${StoreEnum.queue}/${SEARCH_MESSAGE_QUEUE}`,
  async (payload: SearchMessageQueueReq = {}, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.queue]?.[MESSAGE_QUEUE_PAGINATION] || initialState[MESSAGE_QUEUE_PAGINATION];
      const data = { page: { ...currentPagination, ...(payload?.page || {}) } };

      return await Http.post<SearchMessageQueueRes, SearchMessageQueueReq>(`/${StoreEnum.queue}/${SEARCH_MESSAGE_QUEUE}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

const addMessageQueue = async (data: AddMessageQueueReq) => {
  await Http.post<void, AddMessageQueueReq>(`${StoreEnum.queue}/${ADD_MESSAGE_QUEUE}`, data);
};

const removeMessageQueue = async (queueId: string) => {
  await Http.delete<void>(`${StoreEnum.queue}/${REMOVE_MESSAGE_QUEUE}/${queueId}`);
  messageQueueSlice.actions.deleteMessageQueue(queueId);
};

const messageQueueSlice = createSlice({
  name: StoreEnum.queue,
  initialState,
  reducers: {
    updateMessageCount: (state, actions) => {
      state[MESSAGE_QUEUE_COUNT] = actions.payload;
    },
    deleteMessageQueue: (state, actions) => {
      console.log(actions.payload);
      state[MESSAGE_QUEUE_DATA] = (state[MESSAGE_QUEUE_DATA] || []).filter((item) => item._id !== actions.payload);
    },
    updateMessageQueue: (state, action) => {
      console.log(action.payload);
      state[MESSAGE_QUEUE_DATA] = [...(state[MESSAGE_QUEUE_DATA] || []), action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchMessageQueue.pending, (state) => {
        state[MESSAGE_QUEUE_LOADING] = true;
        state[MESSAGE_QUEUE_ERROR] = null;
      })
      .addCase(searchMessageQueue.fulfilled, (state, action) => {
        state[MESSAGE_QUEUE_DATA] = action.payload.data;
        state[MESSAGE_QUEUE_PAGINATION] = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state[MESSAGE_QUEUE_LOADING] = false;
      })
      .addCase(searchMessageQueue.rejected, (state, action) => {
        state[MESSAGE_QUEUE_LOADING] = false;
        state[MESSAGE_QUEUE_ERROR] = action.payload as ErrorResponse;
      });
  },
});

export default {
  reducer: messageQueueSlice.reducer,
  [UPDATE_MESSAGE_COUNT]: messageQueueSlice.actions.updateMessageCount,
  [UPDATE_MESSAGE_QUEUE]: messageQueueSlice.actions.updateMessageQueue,
  [DELETE_MESSAGE_QUEUE]: messageQueueSlice.actions.deleteMessageQueue,
  [ADD_MESSAGE_QUEUE]: addMessageQueue,
  [REMOVE_MESSAGE_QUEUE]: removeMessageQueue,
  [SEARCH_MESSAGE_QUEUE]: searchMessageQueue,
};
