import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { StepperModalProps } from '@components/StepperModal/StepperModal.types';
import Modal from '@components/Modal/Modal';
import { ModalRef } from '@components/Modal/Modal.types';

const StepperModal = forwardRef<ModalRef, StepperModalProps>((props, ref) => {
  const { steps, submitCallback, submitText, cancelText, title, subtitle, ...rest } = props;
  const modalRef = useRef<ModalRef>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const onNextCallback = async (...args: Array<unknown>) => {
    if (!modalRef.current?.validate()) {
      return;
    }

    if (stepIndex < steps.length - 1) {
      await steps[stepIndex].onSubmit?.();
      setStepIndex(stepIndex + 1);

      return;
    }

    await submitCallback?.(...args);
    modalRef.current?.close();
  };

  const onCancelCallback = async () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      return;
    }

    modalRef.current?.close();
  };

  const submitCaption = stepIndex === steps.length - 1 ? submitText : 'GENERAL.NEXT';
  const cancelCaption = stepIndex === 0 ? cancelText : 'GENERAL.BACK';
  const hideBack = stepIndex > 0 && steps[stepIndex].hideBack;

  useImperativeHandle(ref, () => ({
    open: (...args: Array<unknown>) => {
      setStepIndex(0);

      modalRef.current?.open(...args);
    },
    close: (...args: Array<unknown>) => modalRef.current?.close(...args),
    validate: () => !!modalRef.current?.validate(),
  }));

  return (
    <Modal
      ref={modalRef}
      title={steps[stepIndex].title || title}
      subtitle={steps[stepIndex].subtitle || subtitle}
      submitText={submitCaption}
      submitCallback={onNextCallback}
      cancelText={cancelCaption}
      cancelCallback={onCancelCallback}
      hideCancelButton={hideBack}
      {...rest}
    >
      {steps[stepIndex].component}
    </Modal>
  );
});

StepperModal.displayName = 'StepperModal';

export default StepperModal;
