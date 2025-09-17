// src/client/store/instance/instance.slice.ts
// This slice includes auto-save/auto-load functionality for filter data
// Filter changes are automatically saved to localStorage
// On mount, saved filter data is loaded from localStorage into the initial state
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState } from '@client/store';
import {
  ACTIVE_TOGGLE_INSTANCE,
  ADD_INSTANCE,
  DELETE_INSTANCE,
  INSTANCE_ERROR,
  INSTANCE_LOADING,
  INSTANCE_REFRESH,
  INSTANCE_SEARCH_DATA,
  INSTANCE_SEARCH_FILTER,
  INSTANCE_SEARCH_PAGINATION,
  IS_GLOBAL_WARMING_UP,
  RESET_INSTANCE,
  SEARCH_INSTANCE,
  UPDATE_FILTER,
  UPDATE_INSTANCE,
  WARMUP_TOGGLE,
} from '@client/pages/Instance/store/instance.constants';
import type { AddInstanceRes, SearchInstanceReq, SearchInstanceRes } from '@client/pages/Instance/store/instance.types';
import type { ErrorResponse } from '@services/http/types';
import isEqual from 'lodash/isEqual';
import { loadInstanceFilter, saveInstanceFilter, clearInstanceStorage } from './instance.storage';
import { ApiService } from '@services/http/api.service';

export interface InstanceState {
  [INSTANCE_SEARCH_DATA]: SearchInstanceRes['data'] | null;
  [INSTANCE_SEARCH_PAGINATION]: Partial<Omit<SearchInstanceRes, 'data'>>;
  [INSTANCE_SEARCH_FILTER]: Partial<Omit<SearchInstanceReq, 'page'>>;
  [INSTANCE_LOADING]: boolean;
  [INSTANCE_ERROR]: ErrorResponse | null;
  [IS_GLOBAL_WARMING_UP]: boolean;
}

const initialState: InstanceState = {
  [INSTANCE_SEARCH_DATA]: null,
  [INSTANCE_SEARCH_PAGINATION]: { pageSize: 50 },
  [INSTANCE_SEARCH_FILTER]: loadInstanceFilter(),
  [INSTANCE_LOADING]: false,
  [INSTANCE_ERROR]: null,
  [IS_GLOBAL_WARMING_UP]: false,
};

const api = new ApiService('/instance');

// Async thunk for search instance
const searchInstance = createAsyncThunk(
  `${StoreEnum.instance}/${SEARCH_INSTANCE}`,
  async ({ page, ...payload }: SearchInstanceReq = {}, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentFilter = state[StoreEnum.instance]?.[INSTANCE_SEARCH_FILTER];
      const currentPagination = state[StoreEnum.instance]?.[INSTANCE_SEARCH_PAGINATION] || initialState[INSTANCE_SEARCH_PAGINATION];
      const data = { ...currentFilter, ...payload, page: { ...currentPagination, ...(page || {}) } };

      return await api.post<SearchInstanceRes, SearchInstanceReq>(`${SEARCH_INSTANCE}`, data, { allowOnceAtTime: true });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'CanceledError') return Promise.reject(error);

      // For other errors, create a serializable error object
      const serializableError =
        error instanceof Error ? { message: error.message, name: error.name } : { message: 'Unknown error', name: 'UnknownError' };

      return rejectWithValue(serializableError);
    }
  }
);

const instanceQr = async (phoneNumber: string) => {
  const { image } = await api.get<AddInstanceRes>(`${ADD_INSTANCE}/${phoneNumber}`);

  return image;
};

const deleteInstance = createAsyncThunk(`${StoreEnum.instance}/${DELETE_INSTANCE}`, async (phoneNumber: string, { dispatch }) => {
  await api.delete<void>(`${DELETE_INSTANCE}/${phoneNumber}`);
  await dispatch(searchInstance({}));
});

const toggleInstanceActivate = createAsyncThunk(`${ACTIVE_TOGGLE_INSTANCE}`, async (phoneNumber: string, { dispatch, getState }) => {
  const state = getState() as RootState;
  const currentInstance = state[StoreEnum.instance]?.[INSTANCE_SEARCH_DATA]?.find((instance) => instance.phoneNumber === phoneNumber);
  const isActive = !!currentInstance?.isActive;
  await api.post<void>(`${ACTIVE_TOGGLE_INSTANCE}/${phoneNumber}`);

  dispatch(instanceSlice.actions.updateInstance({ phoneNumber, isActive: !isActive }));
});

const refreshInstance = createAsyncThunk(`${INSTANCE_REFRESH}`, async (phoneNumber: string, { dispatch }) => {
  await api.post<void>(`${INSTANCE_REFRESH}/${phoneNumber}`);
  await dispatch(searchInstance({}));
});

const toggleWarmup = createAsyncThunk(`${WARMUP_TOGGLE}`, async (_, { dispatch }) => {
  const response = await api.post<{ isWarmingUp: boolean }>(`${WARMUP_TOGGLE}`);
  dispatch(instanceSlice.actions.setGlobalWarmingStatus(response.isWarmingUp));
  return response.isWarmingUp;
});

const resetInstance = createAsyncThunk(`reset`, async (_, { dispatch }) => {
  // Reset filter and pagination to defaults and trigger search
  dispatch(instanceSlice.actions.reset());
  await dispatch(searchInstance({}));
});

const instanceSlice = createSlice({
  name: StoreEnum.instance,
  initialState,
  reducers: {
    clearSearch: (state) => {
      state[INSTANCE_SEARCH_DATA] = null;
    },
    reset: (state) => {
      state[INSTANCE_SEARCH_FILTER] = {};
      state[INSTANCE_SEARCH_PAGINATION] = { pageSize: 50 };
      clearInstanceStorage();
    },
    updateInstance: (state, action) => {
      const data = action.payload;
      if (state[INSTANCE_SEARCH_DATA]) {
        state[INSTANCE_SEARCH_DATA] = state[INSTANCE_SEARCH_DATA].map((i) => (i.phoneNumber === data.phoneNumber ? { ...i, ...data } : i));
      }
    },
    updateFilter: (state, action) => {
      const newFilter = { ...state[INSTANCE_SEARCH_FILTER], ...action.payload };

      if (isEqual(newFilter, state[INSTANCE_SEARCH_FILTER])) {
        return;
      }

      state[INSTANCE_SEARCH_FILTER] = { ...state[INSTANCE_SEARCH_FILTER], ...action.payload };
      state[INSTANCE_SEARCH_PAGINATION] = { ...state[INSTANCE_SEARCH_PAGINATION], pageIndex: 0 };

      // Auto-save filter to localStorage
      saveInstanceFilter(state[INSTANCE_SEARCH_FILTER]);
    },
    setGlobalWarmingStatus: (state, action) => {
      state[IS_GLOBAL_WARMING_UP] = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchInstance.pending, (state, _action) => {
        state[INSTANCE_LOADING] = true;
        state[INSTANCE_ERROR] = null;

        // Don't update filter here to prevent feedback loops
        // The filter should only be updated when explicitly set by the user
      })
      .addCase(searchInstance.fulfilled, (state, action) => {
        state[INSTANCE_SEARCH_DATA] = action.payload.data;
        state[INSTANCE_SEARCH_PAGINATION] = {
          totalItems: action.payload.totalItems,
          hasMore: action.payload.hasMore,
          pageIndex: action.payload.pageIndex,
          pageSize: action.payload.pageSize,
          totalPages: action.payload.totalPages,
          pageSort: action.payload.pageSort,
        };
        state[INSTANCE_LOADING] = false;
      })
      .addCase(searchInstance.rejected, (state, action) => {
        state[INSTANCE_LOADING] = false;
        state[INSTANCE_ERROR] = action.payload as ErrorResponse;
      });
  },
});

export default {
  reducer: instanceSlice.reducer,
  [SEARCH_INSTANCE]: searchInstance,
  [DELETE_INSTANCE]: deleteInstance,
  [ACTIVE_TOGGLE_INSTANCE]: toggleInstanceActivate,
  [INSTANCE_REFRESH]: refreshInstance,
  [WARMUP_TOGGLE]: toggleWarmup,
  [ADD_INSTANCE]: instanceQr,
  [UPDATE_INSTANCE]: instanceSlice.actions.updateInstance,
  [UPDATE_FILTER]: instanceSlice.actions.updateFilter,
  [RESET_INSTANCE]: resetInstance,
  actions: instanceSlice.actions,
};
