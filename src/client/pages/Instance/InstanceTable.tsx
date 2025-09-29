import type { Pagination } from '@models';
import type { TableHeader, TableHeaders, TableProps } from '@components/Table/Table.type';
import type { RootState, AppDispatch } from '@client/store';
import type { InstanceItem, InstanceUpdate, WarmActive, WarmUpdate } from '@client/pages/Instance/store/instance.types';
import type { ModalRef } from '@components/Modal/Modal.types';
import type { MenuItem } from '@components/Menu/Menu.type';
import React, { useEffect, useRef, type MouseEvent } from 'react';
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
  EXPORT_INSTANCES_TO_EXCEL,
  INSTANCE_LOADING,
  INSTANCE_REFRESH,
  INSTANCE_SEARCH_DATA,
  INSTANCE_SEARCH_FILTER,
  INSTANCE_SEARCH_PAGINATION,
  IS_GLOBAL_WARMING_UP,
  SEARCH_INSTANCE,
  UPDATE_INSTANCE,
  UPDATE_INSTANCE_COMMENT,
  WARMUP_TOGGLE,
  WARMUP_TOGGLE_INSTANCE,
} from '@client/pages/Instance/store/instance.constants';
import { useTranslation } from 'react-i18next';
import { cn } from '@client/plugins';
import AddInstanceModal from '@client/pages/Instance/modal/AddInstanceModal';
import getClientSocket from '@helpers/get-client-socket.helper';
import { openDeletePopup } from '@helpers/open-delete-popup';
import { InstanceEventEnum } from '@client/pages/Instance/constants/instance-event.enum';
import { liveUpdateHandler } from '@helpers/live-update-handler';
import { useAsyncFn, useToast, useTooltip } from '@hooks';
import Icon from '@components/Icon/Icon';
import Avatar from '@components/Avatar/Avatar';
import { InstanceSearchPanel } from '@client/pages/Instance/components/InstanceSearchPanel';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';
import { RouteName } from '@client/router/route-name';
import { TextField } from '@components/Fields';
import ToggleSwitch from '@components/Fields/ToggleSwitch/ToggleSwitch';

const InstanceItem = ({ item }: { item: InstanceItem }) => {
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
};

const ActiveStatus = ({ item }: { item: InstanceItem }) => {
  const { [ACTIVE_TOGGLE_INSTANCE]: toggleInstanceActivate } = instanceStore;

  const dispatch = useDispatch<AppDispatch>();
  const onActiveToggle = async ({ phoneNumber }: InstanceItem) => await dispatch(toggleInstanceActivate(phoneNumber));

  return <ToggleSwitch className="flex align-middle justify-center" modelValue={item.isActive} onUpdateModelValue={() => onActiveToggle(item)} />;
};

const WarmStatus = ({ item }: { item: InstanceItem }) => {
  const { [WARMUP_TOGGLE_INSTANCE]: toggleInstanceWarmUp } = instanceStore;

  const dispatch = useDispatch<AppDispatch>();
  const onActiveToggle = async ({ phoneNumber }: InstanceItem) => await dispatch(toggleInstanceWarmUp(phoneNumber));

  return <ToggleSwitch className="flex align-middle justify-center" modelValue={item.hasWarmedUp} onUpdateModelValue={() => onActiveToggle(item)} />;
};

const StatusCode = ({ item }: { item: InstanceItem }) => {
  const { t } = useTranslation();
  const ref = useTooltip<HTMLDivElement>({ text: t(item.errorMessage) });

  return <span ref={ref}>{item?.statusCode || '-'}</span>;
};

type EditToggleProps = {
  isEditMode: boolean;
  hasChanges: boolean;
  onEdit: (ev: MouseEvent) => void;
  onCancel: () => void;
  isHover: boolean;
};

const CommentEditToggle = ({ isHover, isEditMode, hasChanges, onEdit, onCancel }: EditToggleProps) => {
  const { t } = useTranslation();
  const divRef = useTooltip<HTMLDivElement>({ text: t(isEditMode ? 'GENERAL.REVERT' : 'GENERAL.EDIT') });

  return (
    <div ref={divRef}>
      {isEditMode ? (
        <Icon name="svg:refresh" size="1rem" className={cn('text-gray-400 me-2', !hasChanges && 'opacity-0')} onClick={onCancel} />
      ) : (
        <Icon name="svg:edit" size="1rem" className={cn('text-gray-400 me-2', !isHover && 'opacity-0')} onClick={onEdit} />
      )}
    </div>
  );
};

const Comment = ({ item }: { item: InstanceItem }) => {
  const toast = useToast();
  const { [UPDATE_INSTANCE_COMMENT]: updateInstanceComment } = instanceStore;
  const inputRef = useTooltip<HTMLInputElement>({ text: item?.comment });
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [clickCount, setClickCount] = React.useState(0);
  const [isEditMode, setEditMode] = React.useState(false);
  const [value, setValue] = React.useState(item?.comment || '');

  // Sync local state with item prop changes
  React.useEffect(() => {
    setValue(item?.comment || '');
  }, [item?.comment]);

  const updateRequest = useAsyncFn(updateInstanceComment, {
    successCallback: () => {
      toast.success('INSTANCE.COMMENT_HAS_BEEN_UPDATED_SUCCESSFULLY');
    },
    errorCallback: () => {
      toast.error('INSTANCE.COMMENT_UPDATE_FAILED');
      setValue(item?.comment || '');
    },
  });

  const onClick = (ev: MouseEvent) => {
    ev.stopPropagation();
    setClickCount((prev) => prev + 1);
    clearTimeout(timeoutRef.current);
    if (clickCount === 1) setEditMode(true);

    timeoutRef.current = setTimeout(() => setClickCount(0), 300);
  };

  const onEdit = (ev: MouseEvent) => {
    ev.stopPropagation();
    setEditMode(true);
    inputRef?.current?.focus();
  };

  const onCancel = () => {
    setValue(item?.comment || '');
    setEditMode(false);
  };

  const onSave = () => {
    setEditMode(false);
    if (value === (item.comment || '')) return;

    updateRequest.call(item.phoneNumber, value.trim());
  };

  return (
    <TextField
      ref={inputRef}
      containerClass={'border-none'}
      hideDetails
      loading={updateRequest.loading}
      readOnly={!isEditMode || updateRequest.loading}
      name="comment"
      value={value}
      AppendComponent={({ isHover }) => (
        <CommentEditToggle
          isEditMode={isEditMode}
          hasChanges={value !== (item.comment || '')}
          onEdit={onEdit}
          onCancel={onCancel}
          isHover={isHover}
        />
      )}
      onChange={setValue}
      onClick={!isEditMode ? onClick : (ev) => ev.stopPropagation()}
      onBlur={onSave}
    />
  );
};

const InstanceTable = () => {
  const { t } = useTranslation();
  const modelRef = useRef<ModalRef>(null);
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const toast = useToast({ y: 'bottom' });

  const {
    [SEARCH_INSTANCE]: searchInstance,
    [DELETE_INSTANCE]: deleteInstance,
    [INSTANCE_REFRESH]: refreshInstance,
    [UPDATE_INSTANCE]: updateInstance,
    [WARMUP_TOGGLE]: toggleWarmup,
    [EXPORT_INSTANCES_TO_EXCEL]: exportInstancesToExcel,
    actions: instanceActions,
  } = instanceStore;

  const {
    [INSTANCE_SEARCH_DATA]: instanceList,
    [INSTANCE_SEARCH_FILTER]: instanceFilter,
    [INSTANCE_SEARCH_PAGINATION]: instancePagination,
    [INSTANCE_LOADING]: instanceLoading,
    [IS_GLOBAL_WARMING_UP]: isGlobalWarmingUp,
  } = useSelector((state: RootState) => state[StoreEnum.instance]);

  const headers: TableHeaders<InstanceItem> = [
    {
      title: 'INSTANCE.PHONE_NUMBER',
      value: 'phoneNumber',
      sortable: ['hasWarmedUp', 'phoneNumber'],
      searchable: true,
      component: InstanceItem,
      type: 'TEXT',
    },
    {
      title: 'GENERAL.ACTIVE',
      value: 'isActive',
      sortable: true,
      component: ActiveStatus,
      export: false,
      hidden: instanceFilter.statusCode === 200,
    },
    {
      title: 'INSTANCE.WARMED_UP',
      value: 'hasWarmedUp',
      sortable: true,
      component: WarmStatus,
      export: false,
      hidden: instanceFilter.statusCode !== 200,
    },
    {
      title: 'INSTANCE.STATUS_CODE',
      value: 'statusCode',
      class: ['text-center'],
      sortable: true,
      component: StatusCode,
      type: 'NUMBER',
    },
    { title: 'INSTANCE.DAILY_MESSAGE_COUNT', value: 'dailyMessageCount', class: ['text-center'], sortable: true, type: 'NUMBER' },
    { title: 'INSTANCE.OUTGOING_FAILURE_COUNT', value: 'outgoingErrorCount', class: ['text-center'], sortable: true, type: 'NUMBER' },
    { title: 'INSTANCE.OUTGOING_COUNT', value: 'outgoingMessageCount', class: ['text-center', 'max-w-[100px'], sortable: true, type: 'NUMBER' },
    { title: 'INSTANCE.INCOMING_COUNT', value: 'incomingMessageCount', class: ['text-center'], sortable: true, type: 'NUMBER' },
    { title: 'INSTANCE.WARM_DAY', value: 'warmUpDay', class: ['text-center'], sortable: true, export: false },
    { title: 'INSTANCE.DAILY_WARM_MESSAGES', value: 'dailyWarmUpCount', class: ['text-center'], sortable: true, export: false },
    { title: 'INSTANCE.IP_ADDRESS', value: 'lastIpAddress', class: ['text-center'], sortable: true, type: 'TEXT' },
    { title: 'GENERAL.COMMENT', value: 'comment', class: ['min-w-[160px]'], sortable: true, component: Comment, type: 'TEXT' },
    {
      title: 'GENERAL.CREATED_AT',
      value: 'createdAt',
      hidden: !!instanceFilter.statusCode && instanceFilter.statusCode !== 200,
      class: ['whitespace-nowrap'],
      sortable: true,
      component: ({ item }) => dayjs(item.createdAt).format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT),
      type: 'DATETIME',
    },
    { title: 'INSTANCE.ERROR_MESSAGE', value: 'errorMessage', hidden: true, type: 'TEXT', export: true },
    {
      title: 'INSTANCE.LAST_ERROR_AT',
      value: 'lastErrorAt',
      hidden: !instanceFilter.statusCode || instanceFilter.statusCode === 200,
      class: ['whitespace-nowrap'],
      sortable: true,
      component: ({ item }) => (item.lastErrorAt ? dayjs(item.lastErrorAt).format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT) : null),
      type: 'DATETIME',
      export: true,
    },
  ];

  const onPageChange = (pageIndex: number) => {
    dispatch(searchInstance({ page: { pageIndex } }));
  };

  const onSort = (pageSort: Pagination['pageSort']) => {
    dispatch(searchInstance({ page: { pageSort } }));
  };

  const onRowClick = (item: InstanceItem) => {
    navigate(`/${RouteName.instance}/${item?.phoneNumber}`);
  };

  useEffect(() => {
    if (!instanceList) {
      dispatch(searchInstance({ page: {} }));
    }
  }, [dispatch, instanceList]);

  // Initialize global warming status based on any instance warming status
  useEffect(() => {
    if (instanceList && instanceList.length > 0) {
      const anyInstanceWarming = instanceList.some((instance) => instance.isWarmingUp);
      if (anyInstanceWarming !== isGlobalWarmingUp) {
        dispatch(instanceActions.setGlobalWarmingStatus(anyInstanceWarming));
      }
    }
  }, [dispatch, instanceList, isGlobalWarmingUp, instanceActions]);

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
      const phoneNumber1 = internationalPhonePrettier(data.phoneNumber1, '-', true);
      const phoneNumber2 = internationalPhonePrettier(data.phoneNumber2, '-', true);

      const text = t('INSTANCE.WARM_END_TOAST', { ...data, phoneNumber1, phoneNumber2 }).toString();
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
      const phoneNumber1 = internationalPhonePrettier(data.phoneNumber1, '-', true);
      const phoneNumber2 = internationalPhonePrettier(data.phoneNumber2, '-', true);

      const text = t('INSTANCE.WARM_START_TOAST', { ...data, phoneNumber1, phoneNumber2 }).toString();
      activeWarm(data, true);

      toast.success(text);
    };

    const registerToast = ({ phoneNumber }: InstanceItem) => {
      const text = t('INSTANCE.INSTANCE_REGISTRATION_COMPLETED', { phoneNumber: internationalPhonePrettier(phoneNumber, '-') }).toString();
      modelRef.current?.close();
      toast.success(text);
    };

    const warmingStatusChange = ({ isWarming }: { isWarming: boolean }) => {
      dispatch(instanceActions.setGlobalWarmingStatus(isWarming));
    };

    socket?.on(InstanceEventEnum.INSTANCE_WARM_END, warmEndToast);
    socket?.on(InstanceEventEnum.INSTANCE_WARM_START, warmStartToast);
    socket?.on(InstanceEventEnum.INSTANCE_WARM_ACTIVE, activeWarm);
    socket?.on(InstanceEventEnum.INSTANCE_REGISTERED, registerToast);
    socket?.on(InstanceEventEnum.INSTANCE_UPDATE, instanceUpdate);
    socket?.on(InstanceEventEnum.INSTANCE_WARMING_STATUS, warmingStatusChange);

    return () => {
      socket?.off(InstanceEventEnum.INSTANCE_WARM_END, warmEndToast);
      socket?.off(InstanceEventEnum.INSTANCE_WARM_START, warmStartToast);
      socket?.off(InstanceEventEnum.INSTANCE_WARM_ACTIVE, activeWarm);
      socket?.off(InstanceEventEnum.INSTANCE_REGISTERED, registerToast);
      socket?.off(InstanceEventEnum.INSTANCE_UPDATE, instanceUpdate);
      socket?.off(InstanceEventEnum.INSTANCE_WARMING_STATUS, warmingStatusChange);
    };
  }, [dispatch]);

  const onDelete = async (item: InstanceItem) =>
    await openDeletePopup({
      callback: async () => await dispatch(deleteInstance(item.phoneNumber)),
      description: ['GENERAL.ARE_YOU_SURE_YOU_WANT_TO_DELETE_ITEM', { value: `'${item.phoneNumber}'` }],
    });
  const onRefresh = async ({ phoneNumber }: InstanceItem) => await dispatch(refreshInstance(phoneNumber));
  const onWarmUp = async () => await dispatch(toggleWarmup());

  const onExportToExcel = async () => {
    try {
      const excelHeaders = headers
        .filter((header) => header.export !== false && (!header.hidden || header.export))
        .map((header) => ({
          title: t(header.title as string),
          value: header.value,
          type: header.type || 'TEXT',
        }));

      await dispatch(exportInstancesToExcel(excelHeaders));
    } catch {
      toast.error(t('GENERAL.EXPORT_ERROR'));
    }
  };

  const customActions: TableProps<InstanceItem>['customActions'] = [
    {
      label: 'GENERAL.REAUTHENTICATE',
      iconName: 'svg:scan-qr',
      onClick: ({ phoneNumber }) => modelRef.current?.open(phoneNumber),
      hidden: ({ statusCode }) => statusCode === 200,
    },
    {
      label: 'GENERAL.REFRESH',
      iconName: 'svg:refresh',
      onClick: onRefresh,
    },
  ];

  const tableActions: MenuItem[] = [
    {
      label: isGlobalWarmingUp ? 'INSTANCE.STOP_WARM_UP' : 'INSTANCE.START_WARM_UP',
      iconName: 'svg:warm',
      onClick: onWarmUp,
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
        exportCallback={onExportToExcel}
        tableActions={tableActions}
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
