import React, { useEffect, useRef } from 'react';
import Table from '@components/Table/Table';
import type { TableHeaders } from '@components/Table/Table.type';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@client/store';
import { StoreEnum } from '@client/store/store.enum';
import {
  DELETE_MESSAGE_QUEUE,
  MESSAGE_QUEUE_DATA,
  MESSAGE_QUEUE_LOADING,
  MESSAGE_QUEUE_PAGINATION,
  REMOVE_MESSAGE_QUEUE,
  SEARCH_MESSAGE_QUEUE,
} from '@client/pages/MessageQueue/store/message-queue.constants';
import type { Pagination } from '@models';
import messageQueueSlice from '@client/pages/MessageQueue/store/message-queue.slice';
import type { MessageQueueItem } from '@client/pages/MessageQueue/store/message-queue.types';
import AddQueueModal from '@client/pages/MessageQueue/modal/AddQueueModal';
import type { ModalRef } from '@components/Modal/Modal.types';
import { openDeletePopup } from '@helpers/open-delete-popup';
import { useToast } from '@hooks';
import getClientSocket from '@helpers/get-client-socket.helper';
import { useTranslation } from 'react-i18next';
import { MessageQueueEventEnum } from '@client/pages/MessageQueue/constants/message-queue-event.enum';

const MessageQueue = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast({ y: 'bottom' });
  const modelRef = useRef<ModalRef>(null);

  const {
    [MESSAGE_QUEUE_DATA]: queueList,
    [MESSAGE_QUEUE_PAGINATION]: queuePagination,
    [MESSAGE_QUEUE_LOADING]: queueLoading,
  } = useSelector((state: RootState) => state[StoreEnum.queue]);

  const { [SEARCH_MESSAGE_QUEUE]: searchMessageQueue, [REMOVE_MESSAGE_QUEUE]: removeQueue, [DELETE_MESSAGE_QUEUE]: deleteQueue } = messageQueueSlice;

  const headers: TableHeaders<MessageQueueItem> = [
    { title: 'QUEUE.PHONE_NUMBER', value: 'phoneNumber' },
    { title: 'QUEUE.FULL_NAME', value: 'fullName' },
    { title: 'QUEUE.TEXT_MESSAGE', value: 'textMessage' },
  ];

  const onPageChange = (pageIndex: number) => {
    dispatch(searchMessageQueue({ page: { pageIndex } }));
  };

  const onSort = (pageSort: Pagination['pageSort']) => {
    dispatch(searchMessageQueue({ page: { pageSort } }));
  };

  const onDelete = async (item: MessageQueueItem) => {
    await openDeletePopup({
      callback: async () => await removeQueue(item._id),
      description: ['GENERAL.ARE_YOU_SURE_YOU_WANT_TO_DELETE_ITEM', { value: '' }],
    });
  };

  useEffect(() => {
    if (!queueList) {
      dispatch(searchMessageQueue({ page: {} }));
    }
  }, [dispatch, queueList]);

  useEffect(() => {
    const socket = getClientSocket();

    const successToast = ({ phoneNumber, _id }: MessageQueueItem) => {
      const text = t('QUEUE.SENT_MESSAGE_SUCCESSFULLY', { phoneNumber }).toString();
      toast.success(text);
      dispatch(deleteQueue(_id));
    };

    const failedToast = ({ phoneNumber, _id }: MessageQueueItem) => {
      const text = t('QUEUE.SENT_MESSAGE_FAILED', { phoneNumber }).toString();
      toast.error(text);
      dispatch(deleteQueue(_id));
    };

    socket?.on(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, successToast);
    socket?.on(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, failedToast);

    return () => {
      socket?.off(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, successToast);
      socket?.off(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, failedToast);
    };
  }, [dispatch, deleteQueue, toast, t]);

  return (
    <>
      <Table
        loading={queueLoading}
        headers={headers}
        items={queueList || []}
        pageIndex={queuePagination.pageIndex}
        pageSize={queuePagination.pageSize}
        createCallback={() => modelRef.current?.open()}
        deleteCallback={onDelete}
        onPageChange={onPageChange}
        onSort={onSort}
      />

      <AddQueueModal ref={modelRef} />
    </>
  );
};

export default MessageQueue;
