// src/client/store/index.ts
import { StoreEnum } from '@client/store/store.enum';
import authSlice, { type AuthState } from '@client/store/auth.slice';
import { configureStore } from '@reduxjs/toolkit';
import { SET_AUTH_STATE } from '@client/store/auth.constants';
import instanceSliceReducer, { type InstanceState } from '@client/pages/Instance/store/instance.slice';
import globalSliceReducer, { type GlobalState } from '@client/store/global.slice';

export type RootState = {
  [StoreEnum.auth]: AuthState;
  [StoreEnum.instance]: InstanceState;
  [StoreEnum.global]: GlobalState;
};

export const createStore = (authState?: Partial<RootState[StoreEnum.auth]>) => {
  const store = configureStore({
    reducer: {
      [StoreEnum.auth]: authSlice.reducer,
      [StoreEnum.instance]: instanceSliceReducer,
      [StoreEnum.global]: globalSliceReducer,
    },
  });

  store.dispatch(authSlice[SET_AUTH_STATE](authState));

  return store;
};

export type AppDispatch = ReturnType<typeof createStore>['dispatch'];
export type AppStore = ReturnType<typeof createStore>;

// Export global slice and hooks
export * from './global.index';
