import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export interface GlobalState {
  nextWarmAt: Date | null;
}

const initialState: GlobalState = {
  nextWarmAt: null,
};

const globalSlice = createSlice({
  name: 'global',
  initialState,
  reducers: {
    setNextWarmAt: (state, action: PayloadAction<Date | null>) => {
      state.nextWarmAt = action.payload;
    },
  },
});

export const { setNextWarmAt } = globalSlice.actions;
export default globalSlice.reducer;
