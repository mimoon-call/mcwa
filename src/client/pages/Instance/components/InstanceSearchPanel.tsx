import TextField from '../../../shared/components/Fields/TextField/TextField';
import { RegexPattern } from '@client-constants';
import { SelectField } from '@components/Fields';
import { Checkbox } from '@components/Checkbox/Checkbox';
import Button from '@components/Button/Button';
import React, { useRef, useState } from 'react';
import { SearchInstanceReq } from '@client/pages/Instance/store/instance.types';
import { useTranslation } from 'react-i18next';
import type { Options } from '@models';
import { statusCodeMap } from '@client/pages/Instance/constants/status-code.map';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@client/store';
import { INSTANCE_SEARCH_FILTER, SEARCH_INSTANCE } from '@client/pages/Instance/store/instance.constants';
import instanceStore from '@client/pages/Instance/store/instance.slice';
import { StoreEnum } from '@client/store/store.enum';
import Form from '@components/Form/Form';
import type { FormRef } from '@components/Form/Form.types';

export const InstanceSearchPanel = () => {
  const { t } = useTranslation();

  const { [SEARCH_INSTANCE]: searchInstance, resetInstance } = instanceStore;
  const { [INSTANCE_SEARCH_FILTER]: instanceFilter } = useSelector((state: RootState) => state[StoreEnum.instance]);

  const dispatch = useDispatch<AppDispatch>();
  const [payload, setPayload] = useState<SearchInstanceReq>(instanceFilter);
  const timeoutRef = useRef<NodeJS.Timeout>(undefined);
  const formRef = useRef<FormRef>(null);

  const statusCode: Options<number> = [200, 401, 403, 408].map((value) => {
    const translation = statusCodeMap.get(value);
    const title = translation ? `${value} - ${t(translation)}` : String(value);
    return { title, value };
  });

  const onSearch = (data: Omit<SearchInstanceReq, 'page'>) => {
    clearTimeout(timeoutRef.current);
    const newPayload = { ...payload, ...data };
    setPayload(newPayload);

    timeoutRef.current = setTimeout(() => {
      if (formRef.current?.validate()) {
        dispatch(searchInstance(newPayload));
      }
    }, 500);
  };

  const onClear = () => {
    setPayload({});
    dispatch(resetInstance());
  };

  return (
    <Form ref={formRef} className="p-4 bg-gray-50 m-2 rounded shadow">
      <div className="flex justify-between">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(6, minmax(300px, 1fr))', minWidth: '400px' }}>
          <TextField
            clearable
            hideDetails
            autoComplete="off"
            name="phoneNumber"
            label="INSTANCE.PHONE_NUMBER"
            pattern={RegexPattern.PHONE_INPUT}
            value={payload.phoneNumber}
            onChange={(value) => onSearch({ phoneNumber: value })}
          />
          <SelectField
            clearable
            name="statusCode"
            label="INSTANCE.STATUS_CODE"
            value={payload.statusCode}
            options={statusCode}
            onChange={(value) => onSearch({ statusCode: value })}
          />
          <Checkbox
            className="mt-2 ms-2"
            label="GENERAL.ACTIVE"
            id="isActive"
            value={payload.isActive || false}
            onChange={() => onSearch({ isActive: !payload.isActive })}
          />
        </div>

        <div className="flex gap-2 items-center pe-2">
          <Button disabled={!Object.values(payload).length} buttonType="flat" onClick={onClear}>
            {t('GENERAL.CLEAR')}
          </Button>
        </div>
      </div>
    </Form>
  );
};
