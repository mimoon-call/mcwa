import type { ModalRef } from '@components/Modal/Modal.types';
import type { StepperModalProps } from '@components/StepperModal/StepperModal.types';
import type { AddMessageQueueReq, MessageQueueItem } from '@client/pages/Queue/store/message-queue.types';
import type { TableHeaders } from '@components/Table/Table.type';
import type { AppDispatch } from '@client/store';
import { OverlayEnum } from '@components/Overlay/Overlay.enum';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import StepperModal from '@components/StepperModal/StepperModal';
import Table from '@components/Table/Table';
import { Checkbox } from '@components/Checkbox/Checkbox';
import { ADD_MESSAGE_QUEUE, SEARCH_MESSAGE_QUEUE } from '@client/pages/Queue/store/message-queue.constants';
import messageQueueSlice from '@client/pages/Queue/store/message-queue.slice';
import { useDispatch } from 'react-redux';
import TextAreaField, { type TextAreaFieldRef } from '@components/Fields/TextAreaField/TextAreaField';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import { RegexPattern } from '@client-constants';
import { useToast } from '@hooks';
import { useTranslation } from 'react-i18next';
import Button from '@components/Button/Button';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';

type AddBulkQueueModalRef = Omit<ModalRef, 'open'> & {
  open: (data: Record<string, string>[], map: Record<string, string>, primaryKey: string) => void;
};
type PayloadData = (Pick<MessageQueueItem, 'phoneNumber'> & { checkFlag?: boolean })[];

const AddBulkQueueModal = forwardRef<AddBulkQueueModalRef>((_props, ref) => {
  const { t } = useTranslation();
  const toast = useToast({ y: 'bottom' });
  const dispatch = useDispatch<AppDispatch>();
  const modalRef = useRef<ModalRef>(null);
  const textAreaRef = useRef<TextAreaFieldRef>(null);
  const [dynamicFields, setDynamicFields] = useState<Record<string, string>>({});

  const [payload, setPayload] = useState<{
    tts: AddMessageQueueReq['tts'];
    textMessage: AddMessageQueueReq['textMessage'];
    data: PayloadData;
  }>({ textMessage: '', tts: false, data: [] });

  const { [ADD_MESSAGE_QUEUE]: addQueue, [SEARCH_MESSAGE_QUEUE]: searchQueue } = messageQueueSlice;

  const [headers, setHeaders] = useState<TableHeaders<MessageQueueItem & { checkFlag?: boolean }>>([]);

  const List = (
    <InputWrapper
      className="d-flex flex-col gap-2"
      name="list"
      value={payload.data}
      rules={{ custom: [(value: PayloadData) => [value.some((item) => item.checkFlag), 'QUEUE.VALIDATE_NO_CONTACT_SELECTED']] }}
    >
      <div className="error:outline-red-700 error:ring-red-600 ring-opacity-100 error:bg-red-50 error:text-red-700">
        <Table headers={headers} items={payload.data} />
      </div>
    </InputWrapper>
  );

  const Message = (
    <div className="flex flex-col gap-2">
      <TextAreaField
        ref={textAreaRef}
        name="textMessage"
        rules={{ required: [true], minLength: [4] }}
        value={payload.textMessage}
        onChange={(value) => setPayload({ ...payload, textMessage: value })}
        rows={13}
      />

      <div className="mb-6">
        <label className="flex flex-col text-slate-600 text-base mb-1 font-medium">{t('QUEUE.DYNAMIC_FIELDS')}</label>

        <div className="flex gap-2">
          {Object.entries(dynamicFields).map(([value, title]) => (
            <Button
              key={value}
              className="bg-blue-50 outline-0"
              type="button"
              buttonType="flat"
              onClick={() => textAreaRef.current?.insertDynamicField(title, `{${value}}`)}
            >
              {title}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );

  const steps: StepperModalProps['steps'] = [
    { title: 'QUEUE.CONTACT_LIST', component: List },
    {
      title: 'QUEUE.TEXT_MESSAGE',
      component: Message,
      additionalActions: <Checkbox label="QUEUE.TEXT_TO_SPEECH" value={!!payload.tts} onChange={(value) => setPayload({ ...payload, tts: value })} />,
    },
  ];

  const onMarkChange = (phoneNumber: string, checkFlag: boolean) => {
    setPayload((prev) => ({
      ...prev,
      data: prev.data.map((item) => (item.phoneNumber === phoneNumber ? { ...item, checkFlag } : item)),
    }));
  };

  const onSubmit = async () => {
    if (!modalRef.current?.validate()) {
      return;
    }

    const data = {
      textMessage: payload.textMessage,
      tts: payload.tts,
      data: payload.data.filter((item) => item.checkFlag),
    };

    const { addedCount, blockedCount } = await addQueue(data);

    if (blockedCount > 0 && addedCount > 0) {
      const totalCount = addedCount + blockedCount;
      toast.warning(t('QUEUE.ADDED_PARTIAL_MESSAGES_TO_QUEUE', { addedCount, totalCount }));
    } else if (blockedCount > 0) {
      toast.error(t('QUEUE.BLOCKED_MESSAGES_NOT_ADDED_TO_QUEUE'));
    } else {
      toast.success(t('QUEUE.ADDED_MESSAGES_TO_QUEUE', { addedCount }));
    }
  };

  useImperativeHandle(ref, () => ({
    open: async (data, columns, primaryKey: string): Promise<void> => {
      const payloadData = data.map((val) => {
        const phoneNumber = val[primaryKey].replace(/\D/g, '');

        return { phoneNumber, columns: { ...val, [primaryKey]: internationalPhonePrettier(phoneNumber, '-', true) } };
      });

      const nonDuplicateData = payloadData.uniqueBy(['phoneNumber']);

      const nonInvalidData = nonDuplicateData
        .filter((value) => RegexPattern.MOBILE_PHONE_IL.test(value.phoneNumber))
        .map((value) => ({ ...value, checkFlag: true }));

      if (!nonInvalidData.length) {
        toast.error(t('QUEUE.NO_VALID_PHONE_NUMBERS_WERE_FOUND'));
        return;
      }

      const customHeaders: TableHeaders<MessageQueueItem & { checkFlag?: boolean; columns?: Record<string, string> }> = [];

      Object.entries(columns).forEach(([value, title]) => {
        if (value === primaryKey) {
          customHeaders.unshift({
            title,
            value,
            component: ({ item }) => (
              <Checkbox
                id={item.phoneNumber}
                label={<span dir="ltr">{item.columns?.[value]}</span>}
                value={item.checkFlag}
                onChange={() => onMarkChange(item.phoneNumber, !item.checkFlag)}
              />
            ),
          });
        } else {
          customHeaders.push({ title, value, component: ({ item }) => item.columns?.[value as keyof typeof item] });
        }
      });

      setHeaders(customHeaders);

      setPayload({ textMessage: '', tts: false, data: nonInvalidData });
      setDynamicFields(columns);
      modalRef.current?.open();
    },
    close: (...args: unknown[]) => modalRef.current?.close(...args),
    validate: () => !!modalRef.current?.validate(),
  }));

  return (
    <StepperModal
      ref={modalRef}
      hideHeaderDivider
      hideContentDivider
      submitText="GENERAL.ADD"
      steps={steps}
      size={OverlayEnum.MD}
      closeCallback={async () => dispatch(searchQueue({}))}
      submitCallback={onSubmit}
    />
  );
});

AddBulkQueueModal.displayName = 'AddBulkQueueModal';

export default AddBulkQueueModal;
