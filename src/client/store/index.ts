// src/client/store/index.ts
import { StoreEnum } from '@client/store/store.enum';
import authSlice, { type AuthState } from '@client/store/auth.slice';
import { configureStore } from '@reduxjs/toolkit';
import { SET_AUTH_STATE } from '@client/store/auth.constants';
import instanceSlice, { type InstanceState } from '@client/pages/Instance/store/instance.slice';

export type RootState = {
  [StoreEnum.auth]: AuthState;
  [StoreEnum.instance]: InstanceState;
};

export const createStore = (authState?: Partial<RootState[StoreEnum.auth]>) => {
  const store = configureStore({
    reducer: {
      [StoreEnum.auth]: authSlice.reducer,
      [StoreEnum.instance]: instanceSlice,
    },
  });

  store.dispatch(authSlice[SET_AUTH_STATE](authState));

  return store;
};

export type AppDispatch = ReturnType<typeof createStore>['dispatch'];
export type AppStore = ReturnType<typeof createStore>;
