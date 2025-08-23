// src/client/shared/helpers/socket-connection-handler.ts
import getClientSocket from './get-client-socket.helper';
import { setNextWarmAt } from '@client/store/global.slice';
import type { AppDispatch } from '@client/store';
import { InstanceEventEnum } from '@client/pages/Instance/constants/instance-event.enum';

export const setupSocketConnectionHandler = (dispatch: AppDispatch) => {
  const socket = getClientSocket();

  if (socket) {
    const onUpdateNextWarm = ({ nextAt }: { nextAt: Date | string | null }) => {
      if (nextAt) {
        const nextWarmTime = new Date(nextAt);
        nextWarmTime.setHours(nextWarmTime.getHours() + 1);
        dispatch(setNextWarmAt(nextWarmTime));
      }
    };

    const onDisconnect = () => {
      dispatch(setNextWarmAt(null));
    };

    socket.off('update', onUpdateNextWarm);
    socket.off('disconnect', onDisconnect);

    socket.on('update', onUpdateNextWarm);
    socket.on('disconnect', onDisconnect);

    socket.off(InstanceEventEnum.INSTANCE_NEXT_WARM_AT, onUpdateNextWarm);
    socket.on(InstanceEventEnum.INSTANCE_NEXT_WARM_AT, onUpdateNextWarm);
  }
};
