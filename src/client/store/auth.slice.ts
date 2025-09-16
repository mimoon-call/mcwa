// src/client/store/auth.slice.ts
import type { LoginReq } from '@client/store/auth.type';
import type { BaseResponse, ErrorResponse } from '@services/http/types';
import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import getClientSocket from '@helpers/get-client-socket.helper';
import { Http } from '@services/http';
import {
  AUTH_STATE_ERROR,
  AUTH_STATE_LOADING,
  IS_AUTHENTICATED,
  LOGIN,
  LOGOUT,
  REFRESH_TOKEN,
  SET_AUTH_STATE,
  SET_AUTHENTICATED,
} from '@client/store/auth.constants';
import { StoreEnum } from '@client/store/store.enum';

export interface AuthState {
  [IS_AUTHENTICATED]: boolean;
  [AUTH_STATE_LOADING]: boolean;
  [AUTH_STATE_ERROR]: ErrorResponse | null;
}

const initialState: AuthState = {
  [IS_AUTHENTICATED]: false,
  [AUTH_STATE_LOADING]: false,
  [AUTH_STATE_ERROR]: null,
};

const BASE_URL = '/auth';

const connectSocket = () => {
  const socket = getClientSocket();

  if (!socket?.connected) {
    socket?.connect();
  }
};

const disconnectSocket = () => {
  const socket = getClientSocket();

  if (socket?.connected) {
    socket.disconnect();
  }
};

// Async thunk for logout
const logout = createAsyncThunk(`${StoreEnum.auth}/${LOGOUT}`, async (_, { rejectWithValue }) => {
  try {
    await Http.post(`${BASE_URL}/${LOGOUT}`, {});
    disconnectSocket();

    return true;
  } catch (error: unknown) {
    return rejectWithValue(error as ErrorResponse);
  }
});

// Async thunk for login
const login = createAsyncThunk(`${StoreEnum.auth}/${LOGIN}`, async (payload: LoginReq, { rejectWithValue }) => {
  try {
    await Http.post(`${BASE_URL}/${LOGIN}`, payload);
    connectSocket();

    return true;
  } catch (error: unknown) {
    disconnectSocket();

    return rejectWithValue(error as ErrorResponse);
  }
});

// Async thunk for checking authentication status (returnCode 1 means not authenticated)
const refreshToken = createAsyncThunk(`${StoreEnum.auth}/${REFRESH_TOKEN}`, async (_, { dispatch }) => {
  const res = await Http.get<BaseResponse>(`${BASE_URL}/${REFRESH_TOKEN}`);

  if (res?.returnCode === 1) {
    disconnectSocket();
    dispatch(authSlice.actions[SET_AUTHENTICATED](false));
  } else {
    dispatch(authSlice.actions[SET_AUTHENTICATED](true));
    connectSocket();
  }
});

const authSlice = createSlice({
  name: StoreEnum.auth,
  initialState,
  reducers: {
    [SET_AUTHENTICATED](state, action: PayloadAction<boolean>) {
      state[IS_AUTHENTICATED] = action.payload;
    },
    [SET_AUTH_STATE](state, action: PayloadAction<Partial<AuthState> | undefined>) {
      if (!action.payload) return;

      Object.assign(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state[AUTH_STATE_LOADING] = true;
        state[AUTH_STATE_ERROR] = null;
      })
      .addCase(login.fulfilled, (state) => {
        state[AUTH_STATE_LOADING] = false;
        state[IS_AUTHENTICATED] = true;
      })
      .addCase(login.rejected, (state, action) => {
        state[AUTH_STATE_LOADING] = false;
        state[AUTH_STATE_ERROR] = action.payload as ErrorResponse;
      })
      .addCase(logout.pending, (state) => {
        state[AUTH_STATE_LOADING] = true;
        state[AUTH_STATE_ERROR] = null;
      })
      .addCase(logout.fulfilled, (state) => {
        state[AUTH_STATE_LOADING] = false;
        state[IS_AUTHENTICATED] = false;
      })
      .addCase(logout.rejected, (state, action) => {
        state[AUTH_STATE_LOADING] = false;
        state[AUTH_STATE_ERROR] = action.payload as ErrorResponse;
      })
      .addCase(refreshToken.pending, (state) => {
        state[AUTH_STATE_LOADING] = true;
        state[AUTH_STATE_ERROR] = null;
      })
      .addCase(refreshToken.fulfilled, (state) => {
        state[AUTH_STATE_LOADING] = false;
      })
      .addCase(refreshToken.rejected, (state) => {
        state[AUTH_STATE_LOADING] = false;
      });
  },
});

export default {
  reducer: authSlice.reducer,
  // mutations
  [SET_AUTH_STATE]: authSlice.actions[SET_AUTH_STATE],
  [SET_AUTHENTICATED]: authSlice.actions[SET_AUTHENTICATED],
  // actions
  [LOGIN]: login,
  [LOGOUT]: logout,
  [REFRESH_TOKEN]: refreshToken,
};
