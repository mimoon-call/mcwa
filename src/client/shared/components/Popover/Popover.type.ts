import type { ReactNode } from 'react';
import type { IconName } from '@components/Icon/Icon.type';
import type { ExposeRef } from '@hooks/useExposeRef';

export type PopoverProps = ExposeRef<
  {
    activator?: ReactNode | IconName;
    children?: ReactNode;
    ariaLabel?: string;
    disabled?: boolean;
    fitWidth?: boolean;
    hover?: boolean;
    closeTimeout?: number;
    offsetX?: number;
    offsetY?: number;
    isActive?: boolean;
    tooltip?: string;
  },
  { close: () => void; open: () => void }
>;
