// src/client/store/index.ts
import { StoreEnum } from '@client/store/store.enum';
import authSlice, { type AuthState } from '@client/store/auth.slice';
import { configureStore } from '@reduxjs/toolkit';
import { SET_AUTH_STATE } from '@client/store/auth.constants';
import instanceSlice, { type InstanceState } from '@client/pages/Instance/store/instance.slice';
import globalSlice, { type GlobalState } from '@client/store/global.slice';
import messageQueueSlice, { type MessageQueueState } from '@client/pages/Queue/store/message-queue.slice';
import chatSlice, { type ChatState } from '@client/pages/Instance/store/chat.slice';
import globalChatSlice, { type GlobalChatState } from '@client/pages/Chat/store/chat.slice';

export type RootState = {
  [StoreEnum.auth]: AuthState;
  [StoreEnum.instance]: InstanceState;
  [StoreEnum.queue]: MessageQueueState;
  [StoreEnum.global]: GlobalState;
  [StoreEnum.chat]: ChatState;
  [StoreEnum.globalChat]: GlobalChatState;
};

export const createStore = (authState?: Partial<RootState[StoreEnum.auth]>) => {
  const store = configureStore({
    reducer: {
      [StoreEnum.auth]: authSlice.reducer,
      [StoreEnum.instance]: instanceSlice.reducer,
      [StoreEnum.queue]: messageQueueSlice.reducer,
      [StoreEnum.global]: globalSlice.reducer,
      [StoreEnum.chat]: chatSlice.reducer,
      [StoreEnum.globalChat]: globalChatSlice.reducer,
    },
  });

  store.dispatch(authSlice[SET_AUTH_STATE](authState));

  return store;
};

export type AppDispatch = ReturnType<typeof createStore>['dispatch'];
export type AppStore = ReturnType<typeof createStore>;
