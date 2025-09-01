import type { TableHeaders, TableProps } from '@components/Table/Table.type';
import type { AppDispatch, RootState } from '@client/store';
import type { Pagination } from '@models';
import type { AddMessageQueueReq, MessageQueueItem } from '@client/pages/MessageQueue/store/message-queue.types';
import type { ModalRef } from '@components/Modal/Modal.types';
import React, { useEffect, useRef } from 'react';
import Table from '@components/Table/Table';
import { useDispatch, useSelector } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import {
  MESSAGE_QUEUE_DATA,
  MESSAGE_QUEUE_LOADING,
  MESSAGE_QUEUE_PAGINATION,
  MESSAGE_SENDING_IN_PROGRESS,
  REMOVE_MESSAGE_QUEUE,
  SEARCH_MESSAGE_QUEUE,
  START_QUEUE_SEND,
  STOP_QUEUE_SEND,
} from '@client/pages/MessageQueue/store/message-queue.constants';
import messageQueueSlice from '@client/pages/MessageQueue/store/message-queue.slice';
import AddQueueModal from '@client/pages/MessageQueue/modal/AddQueueModal';
import { openDeletePopup } from '@helpers/open-delete-popup';
import { useToast } from '@hooks';
import getClientSocket from '@helpers/get-client-socket.helper';
import { useTranslation } from 'react-i18next';
import { MessageQueueEventEnum } from '@client/pages/MessageQueue/constants/message-queue-event.enum';
import FileService from '@services/file.service';
import loadCsvFromFile from '@helpers/load-csv-from-file.helper';
import AddBulkQueueModal from '@client/pages/MessageQueue/modal/AddBulkQueueModal';

const MessageQueue = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast({ y: 'bottom' });
  const modelRef = useRef<ModalRef>(null);
  const bulkModalRef = useRef<ModalRef>(null);

  const {
    [MESSAGE_QUEUE_DATA]: queueList,
    [MESSAGE_QUEUE_PAGINATION]: queuePagination,
    [MESSAGE_QUEUE_LOADING]: queueLoading,
    [MESSAGE_SENDING_IN_PROGRESS]: isSendingInProgress,
  } = useSelector((state: RootState) => state[StoreEnum.queue]);

  const {
    [SEARCH_MESSAGE_QUEUE]: searchMessageQueue,
    [REMOVE_MESSAGE_QUEUE]: removeQueue,
    [START_QUEUE_SEND]: startSend,
    [STOP_QUEUE_SEND]: stopSend,
  } = messageQueueSlice;

  const headers: TableHeaders<MessageQueueItem> = [
    { title: 'QUEUE.PHONE_NUMBER', value: 'phoneNumber' },
    { title: 'QUEUE.FULL_NAME', value: 'fullName' },
    { title: 'QUEUE.TEXT_MESSAGE', value: 'textMessage', class: ['whitespace-pre-line'] },
  ];

  const onPageChange = (pageIndex: number) => {
    dispatch(searchMessageQueue({ page: { pageIndex } }));
  };

  const onSort = (pageSort: Pagination['pageSort']) => {
    dispatch(searchMessageQueue({ page: { pageSort } }));
  };

  const onDelete = async (item: MessageQueueItem) => {
    await openDeletePopup({
      callback: async () => {
        await removeQueue(item._id);
        dispatch(searchMessageQueue({}));
      },
      description: ['GENERAL.ARE_YOU_SURE_YOU_WANT_TO_DELETE_ITEM', { value: '' }],
    });
  };

  const importFile = async () => {
    const file = await FileService.uploadFile();
    const data = await (async () => {
      try {
        return await loadCsvFromFile<AddMessageQueueReq['data']>(file![0], ['fullName', 'phoneNumber'], true, ['phoneNumber']);
      } catch {
        toast.error('VALIDATE.INVALID_FILE');
        throw new Error();
      }
    })();

    bulkModalRef.current?.open(data);
  };

  useEffect(() => {
    if (!queueList) {
      dispatch(searchMessageQueue({ page: {} }));
    }
  }, [dispatch, queueList]);

  useEffect(() => {
    const socket = getClientSocket();

    const successToast = ({ phoneNumber }: MessageQueueItem) => {
      const text = t('QUEUE.SENT_MESSAGE_SUCCESSFULLY', { phoneNumber }).toString();
      toast.success(text);
      dispatch(searchMessageQueue({}));
    };

    const failedToast = ({ phoneNumber }: MessageQueueItem) => {
      const text = t('QUEUE.SENT_MESSAGE_FAILED', { phoneNumber }).toString();
      toast.error(text);
      dispatch(searchMessageQueue({}));
    };

    socket?.on(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, successToast);
    socket?.on(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, failedToast);

    return () => {
      socket?.off(MessageQueueEventEnum.QUEUE_MESSAGE_SENT, successToast);
      socket?.off(MessageQueueEventEnum.QUEUE_MESSAGE_FAILED, failedToast);
    };
  }, [dispatch, searchMessageQueue, toast, t]);

  const tableActions: TableProps<MessageQueueItem>['tableActions'] = [
    {
      label: 'GENERAL.IMPORT_FILE',
      iconName: 'svg:attachment',
      onClick: importFile,
    },
    isSendingInProgress
      ? { label: 'QUEUE.STOP_SENDING', iconName: 'svg:stop', onClick: stopSend }
      : {
          label: 'QUEUE.START_SENDING',
          iconName: 'svg:missile',
          onClick: startSend,
          disabled: () => !!(queuePagination.totalItems === 0 || queueLoading),
        },
  ];

  return (
    <>
      <Table
        loading={queueLoading}
        headers={headers}
        items={queueList || []}
        pageIndex={queuePagination.pageIndex}
        pageSize={queuePagination.pageSize}
        createCallback={() => modelRef.current?.open()}
        tableActions={tableActions}
        deleteCallback={onDelete}
        onPageChange={onPageChange}
        onSort={onSort}
      />

      <AddQueueModal ref={modelRef} />
      <AddBulkQueueModal ref={bulkModalRef} />
    </>
  );
};

export default MessageQueue;
