import type { Pagination } from '@models';
import type { TableHeader, TableHeaders, TableProps } from '@components/Table/Table.type';
import type { RootState, AppDispatch } from '@client/store';
import type { InstanceItem, InstanceUpdate, WarmUpdate } from '@client/pages/Instance/store/instance.types';
import type { ModalRef } from '@components/Modal/Modal.types';
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { DateFormat } from '@client-constants';
import Table from '@components/Table/Table';
import { useSelector, useDispatch } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import { searchInstance, instanceActions, deleteInstance, toggleInstanceActivate } from '@client/pages/Instance/store/instance.slice';
import { INSTANCE_LOADING, INSTANCE_SEARCH_DATA, INSTANCE_SEARCH_PAGINATION } from '@client/pages/Instance/store/instance.constants';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import AddInstanceModal from '@client/pages/Instance/modal/AddInstanceModal';
import getClientSocket from '@helpers/get-client-socket.helper';
import { openDeletePopup } from '@helpers/open-delete-popup';
import { InstanceEventEnum } from '@client/pages/Instance/constants/instance-event.enum';
import { liveUpdateHandler } from '@helpers/live-update-handler';
import { useToast } from '@hooks';

const InstanceTable = () => {
  const { t } = useTranslation();
  const modelRef = useRef<ModalRef>(null);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const toast = useToast({ y: 'bottom' });

  const {
    [INSTANCE_SEARCH_DATA]: instanceList,
    [INSTANCE_SEARCH_PAGINATION]: instancePagination,
    [INSTANCE_LOADING]: instanceLoading,
  } = useSelector((state: RootState) => state[StoreEnum.instance]);

  const headers: TableHeaders<InstanceItem> = [
    { title: 'INSTANCE.PHONE_NUMBER', value: 'phoneNumber', sortable: true },
    {
      title: 'GENERAL.ACTIVE',
      value: 'isActive',
      sortable: true,
      class: ['text-center'],
      component: ({ item }) => (
        <div className={cn('inline-block uppercase min-w-16', item?.isActive === false ? 'text-red-700' : 'text-green-900')}>
          {t(item?.isActive === false ? 'GENERAL.NO' : 'GENERAL.YES')}
        </div>
      ),
    },
    { title: 'INSTANCE.STATUS_CODE', value: 'statusCode', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.ERROR_MESSAGE', class: ['text-nowrap text-ellipsis'], value: 'errorMessage', sortable: true },
    { title: 'INSTANCE.DAILY_MESSAGE_COUNT', value: 'dailyMessageCount', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.OUTGOING_COUNT', value: 'outgoingMessageCount', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.INCOMING_COUNT', value: 'incomingMessageCount', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.WARM_DAY', value: 'warmUpDay', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.DAILY_WARM_MESSAGES', value: 'dailyWarmUpCount', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.DAILY_WARM_CONVERSATIONS', value: 'dailyWarmConversationCount', class: ['text-center'], sortable: true },
    {
      title: 'GENERAL.CREATED_AT',
      value: 'createdAt',
      sortable: true,
      valueFormatter: (value) => dayjs(value).format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT),
    },
  ];

  const onPageChange = (pageIndex: number) => {
    dispatch(searchInstance({ page: { pageIndex } }));
  };

  const onSort = (pageSort: Pagination['pageSort']) => {
    dispatch(searchInstance({ page: { pageSort } }));
  };

  const onRowClick = (item: InstanceItem) => {
    navigate(`/instance/${item?.phoneNumber}`);
  };

  const onDelete = async (item: InstanceItem) =>
    await openDeletePopup({
      callback: async () => await dispatch(deleteInstance(item.phoneNumber)),
      description: ['GENERAL.ARE_YOU_SURE_YOU_WANT_TO_DELETE_ITEM', { value: item.phoneNumber }],
    });

  useEffect(() => {
    if (!instanceList) {
      dispatch(searchInstance({ page: {} }));
    }
  }, [dispatch, instanceList]);

  // Set up socket listener for instance updates
  useEffect(() => {
    const socket = getClientSocket();

    const fieldFormatter = headers.reduce(
      (acc, { value, valueFormatter }) => {
        return valueFormatter ? { ...acc, [value]: valueFormatter } : acc;
      },
      {} as Record<keyof InstanceItem, TableHeader['valueFormatter']>
    );

    const instanceUpdate = liveUpdateHandler<InstanceUpdate>('phoneNumber', (data) => dispatch(instanceActions.updateInstance(data)), fieldFormatter);
    const warmToast = (data: WarmUpdate) => {
      const text = t('INSTANCE.WARM_END_TOAST', data).toString();

      toast.success(text);
    };

    socket?.on(InstanceEventEnum.WARM_END, warmToast);
    socket?.on(InstanceEventEnum.INSTANCE_UPDATE, instanceUpdate);

    return () => {
      socket?.off(InstanceEventEnum.WARM_END, warmToast);
      socket?.off(InstanceEventEnum.INSTANCE_UPDATE, instanceUpdate);
    };
  }, [dispatch]);

  const onActiveToggle = async (item: InstanceItem) => await dispatch(toggleInstanceActivate(item.phoneNumber));

  const customActions: TableProps<InstanceItem>['customActions'] = [
    { label: (item) => (item.isActive ? 'GENERAL.DISABLE' : 'GENERAL.ENABLE'), iconName: 'svg:check-circle', onClick: onActiveToggle },
  ];

  return (
    <>
      <Table
        loading={instanceLoading}
        headers={headers}
        items={instanceList || []}
        createCallback={() => modelRef.current?.open()}
        onPageChange={onPageChange}
        deleteCallback={onDelete}
        onSort={onSort}
        rowClickable={true}
        onRowClick={onRowClick}
        customActions={customActions}
        {...instancePagination}
      />

      <AddInstanceModal ref={modelRef} />
    </>
  );
};

export default InstanceTable;
