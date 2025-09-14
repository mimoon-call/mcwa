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
  openCallback: (...arg: unknown[]) => Promise<unknown> | unknown;
  closeCallback: (...arg: unknown[]) => Promise<unknown> | unknown;
  openEvent: string;
  closeEvent: string;
  disableEscape: boolean;
  hideCloseButton: boolean;
}>;

export type OverlayRef = {
  open: (...arg: unknown[]) => Promise<unknown> | unknown;
  close: (...arg: unknown[]) => Promise<unknown> | unknown;
};
