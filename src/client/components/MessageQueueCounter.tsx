import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@client/store';
import { StoreEnum } from '@client/store/store.enum';
import {
  MESSAGE_QUEUE_COUNT,
  MESSAGE_QUEUE_LEFT,
  UPDATE_MESSAGE_COUNT,
  UPDATE_MESSAGE_LEFT_COUNT,
} from '@client/pages/MessageQueue/store/message-queue.constants';
import messageQueueSlice from '@client/pages/MessageQueue/store/message-queue.slice';
import getClientSocket from '@helpers/get-client-socket.helper';
import { MessageQueueEventEnum } from '@client/pages/MessageQueue/constants/message-queue-event.enum';
import type { ClassValue } from 'clsx';
import { cn } from '@client/plugins';

const MessageQueueCounter = ({ className }: { className?: ClassValue }) => {
  const dispatch = useDispatch<AppDispatch>();

  const { [MESSAGE_QUEUE_COUNT]: count, [MESSAGE_QUEUE_LEFT]: left } = useSelector((state: RootState) => state[StoreEnum.queue]);
  const { [UPDATE_MESSAGE_COUNT]: updateMessageCount, [UPDATE_MESSAGE_LEFT_COUNT]: updateMessageLeftCount } = messageQueueSlice;

  useEffect(() => {
    const socket = getClientSocket();

    const update = ({ messageCount, leftCount }: { messageCount: number; leftCount: number }) => {
      dispatch(updateMessageCount(messageCount));
      dispatch(updateMessageLeftCount(leftCount));
    };

    socket?.on(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, update);

    return () => {
      socket?.off(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, update);
    };
  }, [dispatch]);

  return <div className={cn('px-2', className)}>{[count, left].join(' / ')}</div>;
};

export default MessageQueueCounter;
