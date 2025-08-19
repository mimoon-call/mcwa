import type { ClassValue } from 'clsx';
import type { ReactNode, CSSProperties } from 'react';
import type { OverlayEnum } from '@components/Overlay/Overlay.enum';

export type OverlayProps = Partial<{
  children: ReactNode;
  className: ClassValue;
  style: CSSProperties;
  size: keyof typeof OverlayEnum;
  width: string;
  height: string;
  fitContent: boolean;
  transperant: boolean;
  openCallback: (...arg: Array<any>) => Promise<unknown> | unknown;
  closeCallback: (...arg: Array<any>) => Promise<unknown> | unknown;
  openEvent: string;
  closeEvent: string;
  disableEscape: boolean;
  hideCloseButton: boolean;
}>;

export type OverlayRef = {
  open: (...arg: Array<any>) => void;
  close: (...arg: Array<any>) => void;
};
