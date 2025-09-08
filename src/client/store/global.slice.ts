import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export interface GlobalState {
  nextWarmAt: string | null;
}

const initialState: GlobalState = {
  nextWarmAt: null,
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
  },
});

export default {
  reducer: globalSlice.reducer,
  setNextWarmAt: globalSlice.actions.setNextWarmAt,
};
