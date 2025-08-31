import { useDispatch, useSelector } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState } from '@client/store';
import globalStore from './global.slice';

export const useGlobalState = () => {
  const dispatch = useDispatch();

  const nextWarmAt = useSelector((state: RootState) => state[StoreEnum.global].nextWarmAt);

  const updateNextWarmAt = (date: Date | null) => {
    dispatch(globalStore.setNextWarmAt(date));
  };

  return {
    nextWarmAt,
    updateNextWarmAt,
  };
};
