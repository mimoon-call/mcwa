import type { ReactNode } from 'react';
import type { ClassValue } from 'clsx';

export type TabItem = {
  label: string;
  component: ReactNode;
  hidden?: boolean;
  validateCallback?: () => boolean | Promise<boolean>;
  onClick?: (activeTab: string, tabIndex: number) => void | Promise<void>;
};

export type TabProps = {
  items: Array<TabItem>;
  value?: string | TabItem;
  className?: ClassValue;
  panelClassName?: ClassValue;
  validateCallback?: () => boolean | Promise<boolean>;
  onTabChange?: (activeTab: string, tabIndex: number) => void | Promise<void>;
  tabFocus?: boolean;
  fitHeight?: boolean;
};
