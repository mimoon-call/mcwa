import { useDispatch, useSelector } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState } from '@client/store';
import globalStore from './global.slice';
import type { InstanceStateData } from './global.types';

export const useGlobalState = () => {
  const dispatch = useDispatch();

  const nextWarmAt = useSelector((state: RootState) => state[StoreEnum.global].nextWarmAt);
  const activeList = useSelector((state: RootState) => state[StoreEnum.global].activeList);
  const readyCount = useSelector((state: RootState) => state[StoreEnum.global].readyCount);
  const totalCount = useSelector((state: RootState) => state[StoreEnum.global].totalCount);

  const updateNextWarmAt = (date: Date | string | null) => {
    dispatch(globalStore.setNextWarmAt(date));
  };

  const updateInstanceState = (data: InstanceStateData) => {
    dispatch(globalStore.updateInstanceState(data));
  };

  return {
    nextWarmAt,
    activeList,
    readyCount,
    totalCount,
    updateNextWarmAt,
    updateInstanceState,
  };
};
