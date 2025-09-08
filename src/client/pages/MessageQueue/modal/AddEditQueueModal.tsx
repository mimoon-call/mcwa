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
import TextAreaField, { type TextAreaFieldRef } from '@components/Fields/TextAreaField/TextAreaField';
import { Checkbox } from '@components/Checkbox/Checkbox';
import { useToast } from '@hooks';
import { useTranslation } from 'react-i18next';
import Button from '@components/Button/Button';

type Payload = Pick<MessageQueueItem, 'phoneNumber' | 'fullName' | 'textMessage' | 'tts'> & Partial<{ _id: string }>;
export type AddQueueModalRef = Omit<ModalRef, 'open'> & { open: (payload?: Partial<Payload>) => Promise<void> };

const AddEditQueueModal = forwardRef<AddQueueModalRef>((_props, ref) => {
  const { t } = useTranslation();
  const toast = useToast({ y: 'bottom' });
  const dispatch = useDispatch<AppDispatch>();
  const modalRef = useRef<ModalRef>(null);
  const textAreaRef = useRef<TextAreaFieldRef>(null);
  const [payload, setPayload] = useState<Payload>({ phoneNumber: '', fullName: '', textMessage: '' });
  const [isEditMode, setIsEditMode] = useState(false);

  const { [ADD_MESSAGE_QUEUE]: addQueue, [EDIT_MESSAGE_QUEUE]: updateQueue, [SEARCH_MESSAGE_QUEUE]: searchQueue } = messageQueueSlice;

  const submit = async () => {
    const { phoneNumber, fullName, textMessage, tts } = payload;

    if (payload._id) {
      await updateQueue({ _id: payload._id, phoneNumber, fullName, textMessage });
    } else {
      const data: AddMessageQueueReq = { data: [{ phoneNumber, fullName }], textMessage, tts };
      const { addedCount, blockedCount } = await addQueue(data);

      if (blockedCount > 0 && addedCount > 0) {
        const totalCount = addedCount + blockedCount;
        toast.warning(t('QUEUE.ADDED_PARTIAL_MESSAGES_TO_QUEUE', { addedCount, totalCount }));
      } else if (blockedCount > 0) {
        toast.error(t('QUEUE.BLOCKED_MESSAGES_NOT_ADDED_TO_QUEUE'));
      } else {
        toast.success(t('QUEUE.ADDED_MESSAGES_TO_QUEUE', { addedCount }));
      }
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
      additionalActions={<Checkbox label="QUEUE.TEXT_TO_SPEECH" value={!!payload.tts} onChange={(value) => setPayload({ ...payload, tts: value })} />}
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
            beforeChange={(value) => value.replace(/\D/g, '')}
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
          ref={textAreaRef}
          label="QUEUE.TEXT_MESSAGE"
          name="textMessage"
          rules={{ required: [true] }}
          value={payload.textMessage}
          onChange={(value) => setPayload((prev) => ({ ...prev, textMessage: value }))}
          rows={10}
        />

        <div className="flex gap-2">
          {Object.entries({ fullName: 'QUEUE.FULL_NAME', phoneNumber: 'QUEUE.PHONE_NUMBER' }).map(([value, title]) => (
            <Button
              key={value}
              className="bg-blue-50 outline-0"
              type="button"
              buttonType="flat"
              onClick={() => textAreaRef.current?.insertDynamicField(t(title), `{${value}}`)}
            >
              {t(title)}
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
});

AddEditQueueModal.displayName = 'AddEditQueueModal';

export default AddEditQueueModal;
