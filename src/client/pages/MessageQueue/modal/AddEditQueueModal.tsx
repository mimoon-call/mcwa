import type { ModalRef } from '@components/Modal/Modal.types';
import type { AppDispatch } from '@client/store';
import type { AddMessageQueueReq, MessageQueueItem } from '@client/pages/MessageQueue/store/message-queue.types';
import { OverlayEnum } from '@components/Overlay/Overlay.enum';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from '@components/Modal/Modal';
import messageQueueSlice from '@client/pages/MessageQueue/store/message-queue.slice';
import { ADD_MESSAGE_QUEUE, EDIT_MESSAGE_QUEUE, SEARCH_MESSAGE_QUEUE } from '@client/pages/MessageQueue/store/message-queue.constants';
import TextField from '@components/Fields/TextField/TextField';
import { RegexPattern } from '@client-constants';
import TextAreaField from '@components/Fields/TextAreaField/TextAreaField';

type Payload = Pick<MessageQueueItem, 'phoneNumber' | 'fullName' | 'textMessage'> & Partial<{ _id: string }>;
export type AddQueueModalRef = Omit<ModalRef, 'open'> & { open: (payload?: Partial<Payload>) => Promise<void> };

const AddEditQueueModal = forwardRef<AddQueueModalRef>((_props, ref) => {
  const dispatch = useDispatch<AppDispatch>();
  const modalRef = useRef<ModalRef>(null);
  const [payload, setPayload] = useState<Payload>({ phoneNumber: '', fullName: '', textMessage: '' });
  const [isEditMode, setIsEditMode] = useState(false);

  const { [ADD_MESSAGE_QUEUE]: addQueue, [EDIT_MESSAGE_QUEUE]: updateQueue, [SEARCH_MESSAGE_QUEUE]: searchQueue } = messageQueueSlice;

  const submit = async () => {
    const { phoneNumber, fullName, textMessage } = payload;

    if (payload._id) {
      await updateQueue({ _id: payload._id, phoneNumber, fullName, textMessage });
    } else {
      const data: AddMessageQueueReq = { data: [{ phoneNumber, fullName }], textMessage };
      await addQueue(data);
    }

    modalRef.current?.close();
  };

  useImperativeHandle(ref, () => ({
    open: async (payload?: Partial<Payload>): Promise<void> => {
      setIsEditMode(!!payload);
      setPayload({ phoneNumber: '', fullName: '', textMessage: '', ...(payload || {}) });
      modalRef.current?.open();
    },
    close: (...args: unknown[]) => modalRef.current?.close(...args),
    validate: () => !!modalRef.current?.validate(),
  }));

  return (
    <Modal
      ref={modalRef}
      submitText={isEditMode ? 'GENERAL.UPDATE' : 'GENERAL.ADD'}
      size={OverlayEnum.MD}
      closeCallback={async () => dispatch(searchQueue({}))}
      submitCallback={submit}
    >
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <TextField
            className="flex-grow"
            name="phoneNumber"
            autoComplete="off"
            label="QUEUE.PHONE_NUMBER"
            disabled={isEditMode && !!payload.phoneNumber}
            value={payload.phoneNumber}
            rules={{ required: [true], regex: [RegexPattern.MOBILE_PHONE_IL, 'VALIDATE.INVALID_PHONE_NUMBER'] }}
            pattern={RegexPattern.PHONE_INPUT}
            onChange={(value) => setPayload({ ...payload, phoneNumber: value })}
          />

          <TextField
            className="flex-grow"
            name="fullName"
            autoComplete="off"
            label="QUEUE.FULL_NAME"
            disabled={isEditMode && !!payload.fullName}
            value={payload.fullName}
            rules={{ required: [true] }}
            onChange={(value) => setPayload({ ...payload, fullName: value })}
          />
        </div>

        <TextAreaField
          label="QUEUE.TEXT_MESSAGE"
          name="textMessage"
          rules={{ required: [true] }}
          value={payload.textMessage}
          onChange={(value) => setPayload({ ...payload, textMessage: value })}
          rows={12}
        />
      </div>
    </Modal>
  );
});

AddEditQueueModal.displayName = 'AddEditQueueModal';

export default AddEditQueueModal;
