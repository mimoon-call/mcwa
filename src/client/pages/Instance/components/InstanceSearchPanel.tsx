import TextField from '../../../shared/components/Fields/TextField/TextField';
import { RegexPattern } from '@client-constants';
import { SelectField } from '@components/Fields';
import { Checkbox } from '@components/Checkbox/Checkbox';
import React, { useState } from 'react';
import { SearchInstanceReq } from '@client/pages/Instance/store/instance.types';
import { useTranslation } from 'react-i18next';
import type { Options } from '@models';
import { statusCodeMap } from '@client/pages/Instance/constants/status-code.map';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@client/store';
import { INSTANCE_SEARCH_FILTER, SEARCH_INSTANCE } from '@client/pages/Instance/store/instance.constants';
import instanceStore from '@client/pages/Instance/store/instance.slice';
import { StoreEnum } from '@client/store/store.enum';
import { SearchPanel } from '@client/components/SearchPanel';

export const InstanceSearchPanel = () => {
  const { t } = useTranslation();

  const { [SEARCH_INSTANCE]: searchInstance, resetInstance } = instanceStore;
  const { [INSTANCE_SEARCH_FILTER]: instanceFilter } = useSelector((state: RootState) => state[StoreEnum.instance]);

  const dispatch = useDispatch<AppDispatch>();
  const [payload, setPayload] = useState<SearchInstanceReq>(instanceFilter);

  const statusCode: Options<number> = [200, 401, 403, 408].map((value) => {
    const translation = statusCodeMap.get(value);
    const title = translation ? `${value} - ${t(translation)}` : String(value);
    return { title, value };
  });

  const onChange = (data: Omit<SearchInstanceReq, 'page'>) => {
    const newPayload = { ...payload, ...data };
    setPayload(newPayload);
  };

  const onSearch = () => dispatch(searchInstance(payload));

  const onClear = () => {
    setPayload({});
    dispatch(resetInstance());
  };

  return (
    <SearchPanel onSearch={onSearch} onClear={onClear} payload={payload} debounce={500}>
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
        name="statusCode"
        label="INSTANCE.STATUS_CODE"
        value={payload.statusCode}
        options={statusCode}
        onChange={(value) => onChange({ statusCode: value })}
      />
      <Checkbox
        className="mt-2 ms-2"
        label="GENERAL.ACTIVE"
        id="isActive"
        value={payload.isActive || false}
        onChange={() => onChange({ isActive: !payload.isActive })}
      />
    </SearchPanel>
  );
};
