import type { ModalRef } from '@components/Modal/Modal.types';
import type { StepperModalProps } from '@components/StepperModal/StepperModal.types';
import { OverlayEnum } from '@components/Overlay/Overlay.enum';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import StepperModal from '@components/StepperModal/StepperModal';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@client/store';
import ServerError from '@services/http/server-error';
import TextField from '@components/Fields/TextField/TextField';
import { RegexPattern } from '@client-constants';
import instanceSlice from '@client/pages/Instance/store/instance.slice';
import { ADD_INSTANCE, SEARCH_INSTANCE } from '@client/pages/Instance/store/instance.constants';

type AddInstanceModalRef = Omit<ModalRef, 'open'> & { open: (phoneNumber?: string) => void };

const AddInstanceModal = forwardRef<AddInstanceModalRef>((_props, ref) => {
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [qrData, setQrData] = useState<string | null>(null);
  const [isNumberInjected, setNumberInjected] = useState(false);
  const dispatch = useDispatch<AppDispatch>();
  const modalRef = useRef<ModalRef>(null);

  const { [ADD_INSTANCE]: instanceQr, [SEARCH_INSTANCE]: searchInstance } = instanceSlice;

  const addInstanceQr = async () => {
    if (!phoneNumber) {
      throw new ServerError('Phone number is required');
    }

    const res = await dispatch(instanceQr(phoneNumber));
    setQrData(res.payload as string);
  };

  const InstancePhone = (
    <div className="py-4">
      <TextField
        name="phoneNumber"
        label="INSTANCE.PHONE_NUMBER"
        value={phoneNumber}
        rules={{ required: [true], regex: [RegexPattern.MOBILE_PHONE_IL, 'VALIDATE.INVALID_PHONE_NUMBER'] }}
        pattern={RegexPattern.PHONE_INPUT}
        onChange={setPhoneNumber}
        beforeChange={(value) => value.replace(/\D/g, '')}
      />
    </div>
  );

  const InstanceQr = qrData ? (
    <div className="flex flex-col items-center justify-center h-full gap-2 pb-4 pt-8">
      <h1 className="text-2xl font-semibold">
        Scan QR Code for <code>{phoneNumber}</code>
      </h1>
      <img className="h-72 w-72 aspect-square" src={qrData} alt="WhatsApp QR for ${number}" />
      <p className="font-medium">Open WhatsApp → Menu → Linked Devices → Link a Device</p>
    </div>
  ) : null;

  const steps: StepperModalProps['steps'] = [
    ...(!isNumberInjected ? [{ title: 'INSTANCE.ADD_NEW_INSTANCE', component: InstancePhone, onSubmit: addInstanceQr }] : []),
    { component: InstanceQr, hideBack: true },
  ];

  useImperativeHandle(ref, () => ({
    open: async (instanceNumber?: string): Promise<void> => {
      setQrData(null);
      setNumberInjected(!!instanceNumber);
      setPhoneNumber(instanceNumber || '');

      if (instanceNumber) {
        await addInstanceQr();
      }

      modalRef.current?.open();
    },
    close: (...args: unknown[]) => modalRef.current?.close(...args),
    validate: () => !!modalRef.current?.validate(),
  }));

  return (
    <StepperModal
      ref={modalRef}
      submitText="GENERAL.CLOSE"
      steps={steps}
      size={OverlayEnum.SM}
      hideContentDivider={true}
      closeCallback={async () => dispatch(searchInstance({}))}
    />
  );
});

AddInstanceModal.displayName = 'AddInstanceModal';

export default AddInstanceModal;
