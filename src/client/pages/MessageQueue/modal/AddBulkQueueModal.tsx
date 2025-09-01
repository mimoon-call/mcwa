import type { ModalRef } from '@components/Modal/Modal.types';
import type { StepperModalProps } from '@components/StepperModal/StepperModal.types';
import { OverlayEnum } from '@components/Overlay/Overlay.enum';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import StepperModal from '@components/StepperModal/StepperModal';
import { AddMessageQueueReq, type MessageQueueItem } from '@client/pages/MessageQueue/store/message-queue.types';
import Table from '@components/Table/Table';
import type { TableHeaders } from '@components/Table/Table.type';
import { Checkbox } from '@components/Checkbox/Checkbox';
import { ADD_MESSAGE_QUEUE, SEARCH_MESSAGE_QUEUE } from '@client/pages/MessageQueue/store/message-queue.constants';
import messageQueueSlice from '@client/pages/MessageQueue/store/message-queue.slice';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@client/store';
import TextAreaField from '@components/Fields/TextAreaField/TextAreaField';

type AddInstanceModalRef = Omit<ModalRef, 'open'> & { open: (data: AddMessageQueueReq['data']) => void };

const AddBulkQueueModal = forwardRef<AddInstanceModalRef>((_props, ref) => {
  const dispatch = useDispatch<AppDispatch>();
  const modalRef = useRef<ModalRef>(null);
  const [payload, setPayload] = useState<{
    textMessage: AddMessageQueueReq['textMessage'];
    data: (Pick<MessageQueueItem, 'fullName' | 'phoneNumber'> & { checkFlag?: boolean })[];
  }>({ textMessage: '', data: [] });

  const { [ADD_MESSAGE_QUEUE]: addQueue, [SEARCH_MESSAGE_QUEUE]: searchQueue } = messageQueueSlice;

  const headers: TableHeaders<MessageQueueItem & { checkFlag?: boolean }> = [
    {
      title: 'QUEUE.PHONE_NUMBER',
      value: 'phoneNumber',
      component: ({ item }) => (
        <Checkbox
          label={item.phoneNumber}
          id={item.phoneNumber}
          checked={item.checkFlag}
          onChange={() => onMarkChange(item.phoneNumber, !item.checkFlag)}
        />
      ),
    },
    { title: 'QUEUE.FULL_NAME', value: 'fullName' },
  ];

  const List = <Table headers={headers} items={payload.data} />;

  const Message = (
    <TextAreaField
      name="textMessage"
      rules={{ required: [true] }}
      value={payload.textMessage}
      onChange={(value) => setPayload({ ...payload, textMessage: value })}
      rows={16}
    />
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
    const data = {
      textMessage: payload.textMessage,
      data: payload.data.filter((item) => item.checkFlag).map((item) => ({ phoneNumber: item.phoneNumber, fullName: item.fullName })),
    };

    await addQueue(data);
  };

  useImperativeHandle(ref, () => ({
    open: async (data): Promise<void> => {
      setPayload({ textMessage: '', data: data.map((value) => ({ ...value, checkFlag: true })) });
      modalRef.current?.open();
    },
    close: (...args: Array<unknown>) => modalRef.current?.close(...args),
    validate: () => !!modalRef.current?.validate(),
  }));

  return (
    <StepperModal
      ref={modalRef}
      hideHeaderDivider
      hideContentDivider
      submitText="GENERAL.CLOSE"
      steps={steps}
      size={OverlayEnum.LG}
      closeCallback={async () => dispatch(searchQueue({}))}
      submitCallback={onSubmit}
    />
  );
});

AddBulkQueueModal.displayName = 'AddBulkQueueModal';

export default AddBulkQueueModal;
