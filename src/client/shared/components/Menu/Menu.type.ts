import type { PopoverProps } from '@components/Popover/Popover.type';
import type { IconName } from '@components/Icon/Icon.type';
import type { ClassValue } from 'clsx';
import type { ReactNode } from 'react';

export type MenuItem = {
  label: string | ReactNode;
  iconName?: IconName;
  onClick: () => Promise<unknown> | unknown;
  disabled?: boolean | (() => boolean);
};

export type MenuProps = {
  items: MenuItem[];
  className?: ClassValue;
  activator?: PopoverProps['activator'];
  showSingleAction?: boolean;
} & Partial<PopoverProps>;
