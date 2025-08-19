// src/client/store/index.ts
import { StoreEnum } from '@client/store/store.enum';
import authSlice, { type AuthState } from '@client/store/auth.slice';
import { configureStore } from '@reduxjs/toolkit';
import { SET_AUTH_STATE } from '@client/store/auth.constants';
import instanceSlice, { type InstanceState } from '@client/pages/Instance/store/instance.slice';

export type RootState = {
  [StoreEnum.AUTH]: AuthState;
  [StoreEnum.INSTANCE]: InstanceState;
};

export const createStore = (authState?: Partial<RootState[StoreEnum.AUTH]>) => {
  const store = configureStore({
    reducer: {
      [StoreEnum.AUTH]: authSlice.reducer,
      [StoreEnum.INSTANCE]: instanceSlice,
    },
  });

  store.dispatch(authSlice[SET_AUTH_STATE](authState));

  return store;
};

export type AppDispatch = ReturnType<typeof createStore>['dispatch'];
export type AppStore = ReturnType<typeof createStore>;
