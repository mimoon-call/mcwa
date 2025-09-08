import type { ModalProps } from '@components/Modal/Modal.types';
import type { ReactNode } from 'react';

export type StepperModalProps = Omit<ModalProps, 'cancelCallback'> & {
  steps: {
    title?: ModalProps['title'];
    subtitle?: ModalProps['subtitle'];
    component: ReactNode;
    onSubmit?: () => Promise<void> | void;
    hideBack?: boolean;
    additionalActions?: ModalProps['additionalActions'];
  }[];
};
