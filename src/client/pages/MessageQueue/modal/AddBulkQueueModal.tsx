import type { ModalRef } from '@components/Modal/Modal.types';
import type { StepperModalProps } from '@components/StepperModal/StepperModal.types';
import type { AddMessageQueueReq, MessageQueueItem } from '@client/pages/MessageQueue/store/message-queue.types';
import type { TableHeaders } from '@components/Table/Table.type';
import type { AppDispatch } from '@client/store';
import { OverlayEnum } from '@components/Overlay/Overlay.enum';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import StepperModal from '@components/StepperModal/StepperModal';
import Table from '@components/Table/Table';
import { Checkbox } from '@components/Checkbox/Checkbox';
import { ADD_MESSAGE_QUEUE, SEARCH_MESSAGE_QUEUE } from '@client/pages/MessageQueue/store/message-queue.constants';
import messageQueueSlice from '@client/pages/MessageQueue/store/message-queue.slice';
import { useDispatch } from 'react-redux';
import TextAreaField from '@components/Fields/TextAreaField/TextAreaField';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import { RegexPattern } from '@client-constants';
import { useToast } from '@hooks';
import { useTranslation } from 'react-i18next';

type AddBulkQueueModalRef = Omit<ModalRef, 'open'> & { open: (data: AddMessageQueueReq['data']) => void };
type PayloadData = (Pick<MessageQueueItem, 'phoneNumber' | 'fullName'> & { checkFlag?: boolean })[];

const AddBulkQueueModal = forwardRef<AddBulkQueueModalRef>((_props, ref) => {
  const { t } = useTranslation();
  const toast = useToast({ y: 'bottom' });
  const dispatch = useDispatch<AppDispatch>();
  const modalRef = useRef<ModalRef>(null);
  const [payload, setPayload] = useState<{
    tts: AddMessageQueueReq['tts'];
    textMessage: AddMessageQueueReq['textMessage'];
    data: PayloadData;
  }>({ textMessage: '', tts: false, data: [] });

  const { [ADD_MESSAGE_QUEUE]: addQueue, [SEARCH_MESSAGE_QUEUE]: searchQueue } = messageQueueSlice;

  const headers: TableHeaders<MessageQueueItem & { checkFlag?: boolean }> = [
    {
      title: 'QUEUE.PHONE_NUMBER',
      value: 'phoneNumber',
      component: ({ item }) => (
        <Checkbox
          label={item.phoneNumber}
          id={item.phoneNumber}
          value={item.checkFlag}
          onChange={() => onMarkChange(item.phoneNumber, !item.checkFlag)}
        />
      ),
    },
    { title: 'QUEUE.FULL_NAME', value: 'fullName' },
  ];

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
        name="textMessage"
        rules={{ required: [true], minLength: [4] }}
        value={payload.textMessage}
        onChange={(value) => setPayload({ ...payload, textMessage: value })}
        rows={13}
      />

      <Checkbox label="QUEUE.TEXT_TO_SPEECH" value={!!payload.tts} onChange={(value) => setPayload({ ...payload, tts: value })} />
    </div>
  );

  const steps: StepperModalProps['steps'] = [
    { title: 'QUEUE.CONTACT_LIST', component: List },
    { title: 'QUEUE.TEXT_MESSAGE', component: Message },
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
      data: payload.data.filter((item) => item.checkFlag).map((item) => ({ phoneNumber: item.phoneNumber, fullName: item.fullName })),
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
    open: async (data): Promise<void> => {
      const payloadData = data.map((val) => ({ ...val, phoneNumber: val.phoneNumber.replace(/\D/g, '') }));
      const nonDuplicateData = payloadData.uniqueBy(['phoneNumber']);
      const nonInvalidData = nonDuplicateData
        .filter((value) => RegexPattern.MOBILE_PHONE_IL.test(value.phoneNumber))
        .map((value) => ({ ...value, checkFlag: true }));

      if (!nonInvalidData.length) {
        toast.error(t('QUEUE.NO_VALID_PHONE_NUMBERS_WERE_FOUND'));
        return;
      }

      setPayload({ textMessage: '', tts: false, data: nonInvalidData });
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
