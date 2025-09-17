import type { AppDispatch, RootState } from '@client/store';
import type { ClassValue } from 'clsx';
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import { MESSAGE_QUEUE_COUNT, MESSAGE_QUEUE_SENT_COUNT, UPDATE_MESSAGE_COUNT } from '@client/pages/Queue/store/message-queue.constants';
import messageQueueSlice from '@client/pages/Queue/store/message-queue.slice';
import getClientSocket from '@helpers/get-client-socket.helper';
import { MessageQueueEventEnum } from '@client/pages/Queue/constants/message-queue-event.enum';
import { cn } from '@client/plugins';
import { useTranslation } from 'react-i18next';
import type { MessageQueueActiveEvent } from '@client/pages/Queue/store/message-queue.types';

const MessageQueueCounter = ({ className }: { className?: ClassValue }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const { [MESSAGE_QUEUE_COUNT]: total, [MESSAGE_QUEUE_SENT_COUNT]: current } = useSelector((state: RootState) => state[StoreEnum.queue]);
  const { [UPDATE_MESSAGE_COUNT]: updateMessageCount } = messageQueueSlice;

  useEffect(() => {
    const socket = getClientSocket();

    const update = (data: MessageQueueActiveEvent) => {
      dispatch(updateMessageCount(data));
    };

    socket?.on(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, update);

    return () => {
      socket?.off(MessageQueueEventEnum.QUEUE_SEND_ACTIVE, update);
    };
  }, [dispatch, updateMessageCount]);

  return (
    <div className={cn('px-2 flex gap-2', className)}>
      <span>{t('QUEUE.TITLE')}</span>
      <span dir="ltr">{[current, total].join(' / ')}</span>
    </div>
  );
};

export default MessageQueueCounter;
