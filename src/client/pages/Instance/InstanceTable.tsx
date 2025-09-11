import type { Pagination } from '@models';
import type { TableHeader, TableHeaders, TableProps } from '@components/Table/Table.type';
import type { RootState, AppDispatch } from '@client/store';
import type { InstanceItem, InstanceUpdate, WarmActive, WarmUpdate } from '@client/pages/Instance/store/instance.types';
import type { ModalRef } from '@components/Modal/Modal.types';
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { DateFormat } from '@client-constants';
import Table from '@components/Table/Table';
import { useSelector, useDispatch } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import instanceStore from '@client/pages/Instance/store/instance.slice';
import {
  ACTIVE_TOGGLE_INSTANCE,
  DELETE_INSTANCE,
  INSTANCE_LOADING,
  INSTANCE_REFRESH,
  INSTANCE_SEARCH_DATA,
  INSTANCE_SEARCH_FILTER,
  INSTANCE_SEARCH_PAGINATION,
  SEARCH_INSTANCE,
  UPDATE_INSTANCE,
} from '@client/pages/Instance/store/instance.constants';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import AddInstanceModal from '@client/pages/Instance/modal/AddInstanceModal';
import getClientSocket from '@helpers/get-client-socket.helper';
import { openDeletePopup } from '@helpers/open-delete-popup';
import { InstanceEventEnum } from '@client/pages/Instance/constants/instance-event.enum';
import { liveUpdateHandler } from '@helpers/live-update-handler';
import { useToast, useTooltip } from '@hooks';
import Icon from '@components/Icon/Icon';
import Avatar from '@components/Avatar/Avatar';
import { InstanceSearchPanel } from '@client/pages/Instance/components/InstanceSearchPanel';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';

const InstanceTable = () => {
  const { t } = useTranslation();
  const modelRef = useRef<ModalRef>(null);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const toast = useToast({ y: 'bottom' });

  const {
    [SEARCH_INSTANCE]: searchInstance,
    [DELETE_INSTANCE]: deleteInstance,
    [ACTIVE_TOGGLE_INSTANCE]: toggleInstanceActivate,
    [INSTANCE_REFRESH]: refreshInstance,
    [UPDATE_INSTANCE]: updateInstance,
  } = instanceStore;

  const {
    [INSTANCE_SEARCH_DATA]: instanceList,
    [INSTANCE_SEARCH_FILTER]: instanceFilter,
    [INSTANCE_SEARCH_PAGINATION]: instancePagination,
    [INSTANCE_LOADING]: instanceLoading,
  } = useSelector((state: RootState) => state[StoreEnum.instance]);

  const headers: TableHeaders<InstanceItem> = [
    {
      title: 'INSTANCE.PHONE_NUMBER',
      value: 'phoneNumber',
      sortable: ['hasWarmedUp', 'phoneNumber'],
      searchable: true,
      component: ({ item }) => {
        const iconColorClass = (() => {
          if (item?.isWarmingUp) {
            return 'text-red-600';
          }

          return item?.hasWarmedUp ? 'text-green-600' : 'text-gray-400';
        })();

        return (
          <div className="flex items-center gap-2">
            <Avatar
              size="36px"
              src={item?.profilePictureUrl}
              alt={item?.name || 'GENERAL.PROFILE_PICTURE'}
              iconName={item?.gender === 'female' ? 'svg:avatar-female' : 'svg:avatar-male'}
            />
            <div className="flex flex-col">
              <span className="text-xs text-gray-600">{item?.name}</span>
              <span dir="ltr" className="whitespace-nowrap">
                {internationalPhonePrettier(item.phoneNumber, '-', true)}
              </span>
            </div>
            <div className="flex justify-center items-center ps-2 h-full">
              <Icon className={iconColorClass} name="svg:warm" />
            </div>
          </div>
        );
      },
    },
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
    {
      title: 'INSTANCE.STATUS_CODE',
      value: 'statusCode',
      class: ['text-center'],
      sortable: true,
      component: ({ item }) => {
        const ref = useTooltip<HTMLDivElement>({ text: t(item.errorMessage) });

        return <span ref={ref}>{item?.statusCode || '-'}</span>;
      },
    },
    { title: 'INSTANCE.DAILY_MESSAGE_COUNT', value: 'dailyMessageCount', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.OUTGOING_FAILURE_COUNT', value: 'outgoingErrorCount', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.OUTGOING_COUNT', value: 'outgoingMessageCount', class: ['text-center', 'max-w-[100px'], sortable: true },
    { title: 'INSTANCE.INCOMING_COUNT', value: 'incomingMessageCount', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.WARM_DAY', value: 'warmUpDay', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.DAILY_WARM_MESSAGES', value: 'dailyWarmUpCount', class: ['text-center'], sortable: true },
    { title: 'INSTANCE.IP_ADDRESS', value: 'lastIpAddress', class: ['text-center'], sortable: true },
    {
      title: 'GENERAL.CREATED_AT',
      value: 'createdAt',
      hidden: !!instanceFilter.statusCode && instanceFilter.statusCode !== 200,
      class: ['whitespace-nowrap'],
      sortable: true,
      component: ({ item }) => dayjs(item.createdAt).format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT),
    },
    {
      title: 'INSTANCE.LAST_ERROR_AT',
      value: 'lastErrorAt',
      hidden: !instanceFilter.statusCode || instanceFilter.statusCode === 200,
      class: ['whitespace-nowrap'],
      sortable: true,
      component: ({ item }) => dayjs(item.createdAt).format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT),
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

    const instanceUpdate = liveUpdateHandler<InstanceUpdate>('phoneNumber', (data) => dispatch(updateInstance(data)), fieldFormatter);

    const activeWarm = (data: WarmActive, isWarmingUp: boolean = true) => {
      const { phoneNumber1, phoneNumber2 } = data;

      dispatch(updateInstance({ phoneNumber: phoneNumber1, isWarmingUp }));
      dispatch(updateInstance({ phoneNumber: phoneNumber2, isWarmingUp }));
    };

    const warmEndToast = (data: WarmUpdate) => {
      const text = t('INSTANCE.WARM_END_TOAST', data).toString();
      activeWarm(data, false);

      if (data.sentMessages === 0) {
        toast.error(text);
      } else if (data.sentMessages !== data.totalMessages) {
        toast.warning(text);
      } else {
        toast.success(text);
      }
    };

    const warmStartToast = (data: WarmUpdate) => {
      const text = t('INSTANCE.WARM_START_TOAST', data).toString();
      activeWarm(data, true);

      toast.success(text);
    };

    const registerToast = ({ phoneNumber }: InstanceItem) => {
      const text = t('INSTANCE.INSTANCE_REGISTRATION_COMPLETED', { phoneNumber }).toString();
      modelRef.current?.close();
      toast.success(text);
    };

    socket?.on(InstanceEventEnum.INSTANCE_WARM_END, warmEndToast);
    socket?.on(InstanceEventEnum.INSTANCE_WARM_START, warmStartToast);
    socket?.on(InstanceEventEnum.INSTANCE_WARM_ACTIVE, activeWarm);
    socket?.on(InstanceEventEnum.INSTANCE_REGISTERED, registerToast);
    socket?.on(InstanceEventEnum.INSTANCE_UPDATE, instanceUpdate);

    return () => {
      socket?.off(InstanceEventEnum.INSTANCE_WARM_END, warmEndToast);
      socket?.off(InstanceEventEnum.INSTANCE_WARM_START, warmStartToast);
      socket?.off(InstanceEventEnum.INSTANCE_WARM_ACTIVE, activeWarm);
      socket?.off(InstanceEventEnum.INSTANCE_REGISTERED, registerToast);
      socket?.off(InstanceEventEnum.INSTANCE_UPDATE, instanceUpdate);
    };
  }, [dispatch]);

  const onDelete = async (item: InstanceItem) =>
    await openDeletePopup({
      callback: async () => await dispatch(deleteInstance(item.phoneNumber)),
      description: ['GENERAL.ARE_YOU_SURE_YOU_WANT_TO_DELETE_ITEM', { value: `'${item.phoneNumber}'` }],
    });
  const onActiveToggle = async ({ phoneNumber }: InstanceItem) => await dispatch(toggleInstanceActivate(phoneNumber));
  const onRefresh = async ({ phoneNumber }: InstanceItem) => await dispatch(refreshInstance(phoneNumber));

  const customActions: TableProps<InstanceItem>['customActions'] = [
    {
      label: 'GENERAL.REAUTHENTICATE',
      iconName: 'svg:scan-qr',
      onClick: ({ phoneNumber }) => modelRef.current?.open(phoneNumber),
    },
    {
      label: ({ isActive }) => (isActive ? 'GENERAL.DISABLE' : 'GENERAL.ENABLE'),
      iconName: ({ isActive }) => (isActive ? 'svg:wifi-disconnected' : 'svg:wifi'),
      onClick: onActiveToggle,
    },
    {
      label: 'GENERAL.REFRESH',
      iconName: 'svg:refresh',
      onClick: onRefresh,
    },
    {
      label: 'INSTANCE.CONVERSATIONS',
      iconName: 'svg:chat',
      onClick: ({ phoneNumber }) => navigate(`/instance/${phoneNumber}`),
    },
    {
      label: 'GENERAL.GLOBAL_CHAT',
      iconName: 'svg:users',
      onClick: () => navigate('/chat'),
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <InstanceSearchPanel />

      <div className="flex justify-end pb-2 px-2">
        <div className="text-gray-500 text-sm min-w-fit">{t('GENERAL.TOTAL_ITEMS', { total: instancePagination.totalItems })}</div>
      </div>

      <Table
        className="overflow-y-visible flex-grow"
        keyboardDisabled
        rowClickable
        loading={instanceLoading}
        headers={headers}
        items={instanceList || []}
        createCallback={() => modelRef.current?.open()}
        onPageChange={onPageChange}
        deleteCallback={onDelete}
        onSort={onSort}
        onRowClick={onRowClick}
        customActions={customActions}
        {...instancePagination}
      />

      <AddInstanceModal ref={modelRef} />
    </div>
  );
};

export default InstanceTable;
