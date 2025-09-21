import type { TableHeaders, TableProps } from '@components/Table/Table.type';
import type { AppDispatch, RootState } from '@client/store';
import type { Pagination } from '@models';
import type { MessageQueueItem } from '@client/pages/Queue/store/message-queue.types';
import type { ModalRef } from '@components/Modal/Modal.types';
import React, { useEffect, useRef } from 'react';
import Table from '@components/Table/Table';
import { useDispatch, useSelector } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import {
  CLEAR_MESSAGE_QUEUE,
  MESSAGE_QUEUE_DATA,
  MESSAGE_QUEUE_LOADING,
  MESSAGE_QUEUE_PAGINATION,
  MESSAGE_SENDING_IN_PROGRESS,
  REMOVE_MESSAGE_QUEUE,
  SEARCH_MESSAGE_QUEUE,
  START_QUEUE_SEND,
  STOP_QUEUE_SEND,
} from '@client/pages/Queue/store/message-queue.constants';
import messageQueueSlice from '@client/pages/Queue/store/message-queue.slice';
import AddEditQueueModal, { type AddQueueModalRef } from '@client/pages/Queue/modal/AddEditQueueModal';
import { openDeletePopup } from '@helpers/open-delete-popup';
import { useToast, useTooltip } from '@hooks';
import getClientSocket from '@helpers/get-client-socket.helper';
import { useTranslation } from 'react-i18next';
import { MessageQueueEventEnum } from '@client/pages/Queue/constants/message-queue-event.enum';
import FileService from '@services/file.service';
import loadCsvFromFile from '@helpers/load-csv-from-file.helper';
import AddBulkQueueModal from '@client/pages/Queue/modal/AddBulkQueueModal';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';
import findPhoneFieldHelper from '@helpers/find-phone-field.helper';

const Queue = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast({ y: 'bottom' });
  const addEditQueueModalRef = useRef<AddQueueModalRef>(null);
  const addBulkQueueModalRef = useRef<ModalRef>(null);

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
    [CLEAR_MESSAGE_QUEUE]: clearQueue,
  } = messageQueueSlice;

  const headers: TableHeaders<MessageQueueItem> = [
    {
      title: 'QUEUE.PHONE_NUMBER',
      value: 'phoneNumber',
      class: ['whitespace-nowrap', 'min-w-[180px]'],
      component: ({ item }) => internationalPhonePrettier(item.phoneNumber, '-', true),
    },
    {
      title: 'QUEUE.TEXT_MESSAGE',
      value: 'textMessage',
      class: ['min-w-[30vw]'],
      component: ({ item }) => {
        const divRef = useTooltip<HTMLDivElement>({ text: item.textMessage, style: { maxWidth: '50vw', padding: '1rem' } })!;

        return (
          <div ref={divRef} className="whitespace-pre-line-clamp-3">
            {item.textMessage}
          </div>
        );
      },
    },
    { title: 'QUEUE.LAST_ERROR_MESSAGE', value: 'lastError', class: ['whitespace-pre-line-clamp-3', 'min-w-[240px]'] },
    { title: 'QUEUE.ATTEMPT', value: 'attempt', class: ['text-center'] },
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

  const onUpdate = (item: MessageQueueItem) => {
    addEditQueueModalRef.current?.open(item);
  };

  const onClear = async () => {
    await openDeletePopup({
      callback: async () => {
        await clearQueue();
        dispatch(searchMessageQueue({ page: { pageIndex: 0 } }));
      },
      description: ['QUEUE.ARE_YOU_SURE_YOU_WANT_TO_CLEAR_QUEUE'],
      successMessage: 'QUEUE.MESSAGE_QUEUE_HAS_BEEN_CLEARED',
    });
  };

  const importFile = async () => {
    const file = await FileService.uploadFile();
    const [data, map, key] = await (async () => {
      try {
        const [data, headers] = await loadCsvFromFile(file![0]);
        const phoneNumberKey = findPhoneFieldHelper(data);
        if (!phoneNumberKey) throw new Error();

        return [data, headers, phoneNumberKey];
      } catch {
        toast.error('VALIDATE.INVALID_FILE');
        throw new Error();
      }
    })();

    addBulkQueueModalRef.current?.open(data, map, key);
  };

  useEffect(() => {
    dispatch(searchMessageQueue({ page: {} }));
  }, [dispatch]);

  useEffect(() => {
    const socket = getClientSocket();

    const successToast = ({ phoneNumber }: MessageQueueItem) => {
      const text = t('QUEUE.SENT_MESSAGE_SUCCESSFULLY', { phoneNumber: internationalPhonePrettier(phoneNumber, '-', true) }).toString();
      toast.success(text);
      dispatch(searchMessageQueue({}));
    };

    const failedToast = ({ phoneNumber, attempt, maxAttempts }: MessageQueueItem) => {
      const text = t('QUEUE.SENT_MESSAGE_FAILED', {
        phoneNumber: internationalPhonePrettier(phoneNumber, '-', true),
        attempt,
        maxAttempts,
      }).toString();
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
      label: 'GENERAL.ADD',
      iconName: 'svg:plus',
      onClick: () => addEditQueueModalRef.current?.open(),
    },
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
    { type: 'divider' },
    {
      label: 'QUEUE.DELETE_ALL',
      iconName: 'svg:trash',
      className: 'text-red-800',
      onClick: onClear,
      disabled: () => !!(queuePagination.totalItems === 0 || queueLoading || isSendingInProgress),
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
        totalPages={queuePagination.totalPages}
        tableActions={tableActions}
        deleteCallback={onDelete}
        updateCallback={onUpdate}
        onPageChange={onPageChange}
        onSort={onSort}
      />

      <AddEditQueueModal ref={addEditQueueModalRef} />
      <AddBulkQueueModal ref={addBulkQueueModalRef} />
    </>
  );
};

export default Queue;
