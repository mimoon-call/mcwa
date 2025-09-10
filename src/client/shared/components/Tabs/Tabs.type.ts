import type { ReactNode } from 'react';
import type { ClassValue } from 'clsx';

export type TabItem = {
  label: string;
  hidden?: boolean;
  validateCallback?: () => boolean | Promise<boolean>;
} & (
  | { component: ReactNode; onClick?: never }
  | { component?: never; onClick: (activeTab: string, tabIndex: number) => unknown | Promise<unknown> }
  | { component?: ReactNode; onClick: (activeTab: string, tabIndex: number) => unknown | Promise<unknown> }
);

export type TabProps = {
  items: TabItem[];
  value?: string | TabItem;
  className?: ClassValue;
  panelClassName?: ClassValue;
  validateCallback?: () => boolean | Promise<boolean>;
  onTabChange?: (activeTab: string, tabIndex: number) => unknown | Promise<unknown>;
  tabFocus?: boolean;
  fitHeight?: boolean;
};
