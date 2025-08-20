// src/client/store/instance/instance.slice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { Http } from '@services/http';
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
  INSTANCE_SEARCH_PAGINATION,
  SEARCH_INSTANCE,
} from '@client/pages/Instance/store/instance.constants';
import type { AddInstanceRes, SearchInstanceReq, SearchInstanceRes } from '@client/pages/Instance/store/instance.types';
import type { ErrorResponse } from '@services/http/types';

export interface InstanceState {
  [INSTANCE_SEARCH_DATA]: SearchInstanceRes['data'] | null;
  [INSTANCE_SEARCH_PAGINATION]: Partial<Omit<SearchInstanceRes, 'data'>>;
  [INSTANCE_LOADING]: boolean;
  [INSTANCE_ERROR]: ErrorResponse | null;
}

const initialState: InstanceState = {
  [INSTANCE_SEARCH_DATA]: null,
  [INSTANCE_SEARCH_PAGINATION]: { pageSize: 30 },
  [INSTANCE_LOADING]: false,
  [INSTANCE_ERROR]: null,
};

// Async thunk for search instance
const searchInstance = createAsyncThunk(
  `${StoreEnum.instance}/${SEARCH_INSTANCE}`,
  async (payload: SearchInstanceReq = {}, { rejectWithValue, getState }) => {
    try {
      const state = getState() as RootState;
      const currentPagination = state[StoreEnum.instance]?.[INSTANCE_SEARCH_PAGINATION] || initialState[INSTANCE_SEARCH_PAGINATION];
      const data = { page: { ...currentPagination, ...(payload?.page || {}) } };

      return await Http.post<SearchInstanceRes, SearchInstanceReq>(`/${StoreEnum.instance}/${SEARCH_INSTANCE}`, data);
    } catch (error: unknown) {
      return rejectWithValue(error as ErrorResponse);
    }
  }
);

const instanceQr = createAsyncThunk(`${StoreEnum.instance}/${ADD_INSTANCE}`, async (phoneNumber: string) => {
  const { image } = await Http.get<AddInstanceRes>(`${StoreEnum.instance}/${ADD_INSTANCE}/${phoneNumber}`);

  return image;
});

const deleteInstance = createAsyncThunk(`${StoreEnum.instance}/${DELETE_INSTANCE}`, async (phoneNumber: string, { dispatch }) => {
  await Http.delete<void>(`${StoreEnum.instance}/${DELETE_INSTANCE}/${phoneNumber}`);
  await dispatch(searchInstance({}));
});

const toggleInstanceActivate = createAsyncThunk(
  `${StoreEnum.instance}/${ACTIVE_TOGGLE_INSTANCE}`,
  async (phoneNumber: string, { dispatch, getState }) => {
    const state = getState() as RootState;
    const currentInstance = state[StoreEnum.instance]?.[INSTANCE_SEARCH_DATA]?.find((instance) => instance.phoneNumber === phoneNumber);

    const isActive = !!currentInstance?.isActive;

    await Http.post<void>(`${StoreEnum.instance}/${ACTIVE_TOGGLE_INSTANCE}/${phoneNumber}`);

    dispatch(updateInstance({ phoneNumber, isActive: !isActive }));
  }
);

const refreshInstance = createAsyncThunk(`${StoreEnum.instance}/${INSTANCE_REFRESH}`, async (phoneNumber: string, { dispatch }) => {
  await Http.post<void>(`${StoreEnum.instance}/${INSTANCE_REFRESH}/${phoneNumber}`);
  await dispatch(searchInstance({}));
});

const instanceSlice = createSlice({
  name: StoreEnum.instance,
  initialState,
  reducers: {
    updateInstance: (state, action) => {
      const data = action.payload;
      if (state[INSTANCE_SEARCH_DATA]) {
        state[INSTANCE_SEARCH_DATA] = state[INSTANCE_SEARCH_DATA].map((i) => (i.phoneNumber === data.phoneNumber ? { ...i, ...data } : i));
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchInstance.pending, (state) => {
        state[INSTANCE_LOADING] = true;
        state[INSTANCE_ERROR] = null;
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

// Export the slice and actions correctly
export const { actions: instanceActions } = instanceSlice;
export const { updateInstance } = instanceSlice.actions;
export default instanceSlice.reducer;
export { searchInstance, instanceQr, deleteInstance, toggleInstanceActivate, refreshInstance };
