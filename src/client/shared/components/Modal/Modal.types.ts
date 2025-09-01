import type { OverlayProps } from '@components/Overlay/Overlay.type';
import type { ReactNode } from 'react';
import type { FormRef } from '@components/Form/Form.types';

export type ModalProps = Omit<OverlayProps, 'loading'> & {
  title?: string | ReactNode;
  subtitle?: string | ReactNode;
  submitText?: string;
  submitCallback?: (...arg: unknown[]) => Promise<void>;
  hideCancelButton?: boolean;
  cancelText?: string;
  cancelCallback?: (...arg: unknown[]) => Promise<void>;
  additionalActions?: ReactNode;
  hideContentDivider?: boolean;
  hideHeaderDivider?: boolean;
  sidePanel?: ReactNode;
  autoCloseOnSubmit?: boolean;
};

export type ModalRef = {
  open: (...arg: unknown[]) => void;
  close: (...arg: unknown[]) => void;
  validate: FormRef['validate'];
};
