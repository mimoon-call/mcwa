import type { Options } from '@models';
import type { AppDispatch, RootState } from '@client/store';
import TextField from '../../../shared/components/Fields/TextField/TextField';
import { RegexPattern } from '@client-constants';
import { SelectField } from '@components/Fields';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SearchInstanceReq } from '@client/pages/Instance/store/instance.types';
import { useTranslation } from 'react-i18next';
import { statusCodeMap } from '@client/pages/Instance/constants/status-code.map';
import { useDispatch, useSelector } from 'react-redux';
import { INSTANCE_SEARCH_FILTER, SEARCH_INSTANCE } from '@client/pages/Instance/store/instance.constants';
import instanceStore from '@client/pages/Instance/store/instance.slice';
import { StoreEnum } from '@client/store/store.enum';
import { SearchPanel } from '@client/components/SearchPanel';

export const InstanceSearchPanel = () => {
  const { t } = useTranslation();

  const { [SEARCH_INSTANCE]: searchInstance, resetInstance, updateFilter } = instanceStore;
  const { [INSTANCE_SEARCH_FILTER]: instanceFilter } = useSelector((state: RootState) => state[StoreEnum.instance]);

  const dispatch = useDispatch<AppDispatch>();
  const [payload, setPayload] = useState<SearchInstanceReq>({});

  // Sync payload with Redux filter state only on mount
  useEffect(() => {
    setPayload(instanceFilter);
  }, []); // Empty dependency array - only run on mount

  const statusCode: Options<number> = useMemo(
    () =>
      [200, 401, 403, 408].map((value) => {
        const translation = statusCodeMap.get(value);
        const title = translation ? `${value} - ${t(translation)}` : String(value);
        return { title, value };
      }),
    [t]
  );

  const statusOptions: Options<boolean> = useMemo(
    () => [
      { title: t('GENERAL.YES'), value: true },
      { title: t('GENERAL.NO'), value: false },
    ],
    [t]
  );

  const onChange = useCallback(
    (data: Omit<SearchInstanceReq, 'page'>) => {
      // Update Redux filter state
      dispatch(updateFilter(data));

      // Update local payload for form display
      setPayload((prevPayload) => {
        // Only update if the data actually changed
        const hasChanges = Object.keys(data).some((key) => {
          const typedKey = key as keyof typeof data;
          return prevPayload[typedKey] !== data[typedKey];
        });
        if (!hasChanges) return prevPayload;

        return { ...prevPayload, ...data };
      });
    },
    [dispatch, updateFilter]
  );

  const onSearch = useCallback(() => dispatch(searchInstance({})), [dispatch]);

  const onClear = useCallback(() => {
    setPayload({});
    dispatch(resetInstance());
  }, [dispatch]);

  return (
    <SearchPanel onSearch={onSearch} onClear={onClear} payload={instanceFilter} debounce={500}>
      <TextField
        clearable
        hideDetails
        autoComplete="off"
        name="phoneNumber"
        label="INSTANCE.PHONE_NUMBER"
        pattern={RegexPattern.PHONE_INPUT}
        value={payload.phoneNumber}
        onChange={(value) => onChange({ phoneNumber: value })}
      />
      <SelectField
        clearable
        searchable
        name="statusCode"
        label="INSTANCE.STATUS_CODE"
        value={payload.statusCode}
        options={statusCode}
        onChange={(value) => onChange({ statusCode: value })}
      />
      <SelectField
        clearable
        name="isActive"
        label="GENERAL.ACTIVE"
        value={payload.isActive}
        options={statusOptions}
        onChange={(value) => onChange({ isActive: value })}
      />
    </SearchPanel>
  );
};
