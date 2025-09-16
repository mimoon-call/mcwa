import type { PopoverProps } from '@components/Popover/Popover.type';
import type { IconName } from '@components/Icon/Icon.type';
import type { ClassValue } from 'clsx';
import type { ReactNode } from 'react';

export type MenuItem =
  | {
      type?: never;
      label: string | ReactNode;
      iconName?: IconName;
      className?: ClassValue;
      onClick: () => Promise<unknown> | unknown;
      disabled?: boolean | (() => boolean);
      hidden?: boolean | (() => boolean);
    }
  | {
      type: 'divider';
      label?: never;
      iconName?: never;
      className?: never;
      onClick?: never;
      disabled?: never;
      hidden?: never;
    };

export type MenuProps = {
  items: MenuItem[];
  className?: ClassValue;
  activator?: PopoverProps['activator'];
  showSingleAction?: boolean;
} & Partial<PopoverProps>;
