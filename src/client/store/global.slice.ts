import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { GlobalState, InstanceStateData } from './global.types';

const initialState: GlobalState = {
  nextWarmAt: null,
  activeList: [],
  readyCount: 0,
  totalCount: 0,
};

const globalSlice = createSlice({
  name: 'global',
  initialState,
  reducers: {
    setNextWarmAt: (state, action: PayloadAction<Date | string | null>) => {
      if (action.payload === null) {
        state.nextWarmAt = null;
      } else if (action.payload instanceof Date) {
        state.nextWarmAt = action.payload.toISOString();
      } else {
        state.nextWarmAt = action.payload;
      }
    },
    updateInstanceState: (state, action: PayloadAction<InstanceStateData>) => {
      state.activeList = action.payload.activeList;
      state.readyCount = action.payload.readyCount;
      state.totalCount = action.payload.totalCount;
    },
  },
});

export default {
  reducer: globalSlice.reducer,
  setNextWarmAt: globalSlice.actions.setNextWarmAt,
  updateInstanceState: globalSlice.actions.updateInstanceState,
};
