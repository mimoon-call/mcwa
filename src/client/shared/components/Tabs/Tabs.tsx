// src/client/shared/components/Tabs/Tabs.tsx
import styles from '@components/Tabs/Tabs.module.css';
import React, { useRef } from 'react';
import { useTabs } from '@components/Tabs/hooks/useTabs';
import Icon from '@components/Icon/Icon';
import type { TabProps } from '@components/Tabs/Tabs.type';
import { cn } from '@client/plugins';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

export default function Tabs({ className, panelClassName, fitHeight, children, ...props }: TabProps) {
  if (!props.items?.length) return null;

  const { t } = useTranslation();
  const location = useLocation();

  const { tabs, tabPanelRef, setTabItemRefs, activeTab, onTabClick, onTabFocus, showBackButton, onTabBackClick, showNextButton, onTabNextClick } =
    useTabs(props);

  const tabRefs = useRef<(HTMLSpanElement | null)[]>([]);

  return (
    <div className={cn(styles['tabs'], className, !fitHeight && 'h-full')}>
      <div className={cn(styles['tab-panel'], 'border-b', panelClassName)}>
        <button
          className={cn(styles['tab-back-button'], showBackButton && styles['tab-back-button--shown'])}
          disabled={!showBackButton}
          onClick={() => onTabBackClick()}
        >
          <Icon name="svg:chevron-left" size="1rem" />
        </button>

        <div ref={tabPanelRef} className={cn(styles['tabs-items'])}>
          {tabs.map((tab, i) => {
            if (tab.hidden) return null;

            const isActive = tab.label === activeTab?.label || ('route' in tab && location.pathname.startsWith(tab.route));

            return (
              <div className={cn(isActive && styles['tabs-item--active'])} key={i} role="button">
                <div>
                  <span
                    ref={setTabItemRefs(i)}
                    onClick={() => onTabClick(tab, i)}
                    role="button"
                    tabIndex={props.tabFocus ? i + 1 : -1}
                    onFocus={onTabFocus(tab, i)}
                  >
                    {t(tab.label)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          className={cn(styles['tab-next-button'], showNextButton && styles['tab-next-button--shown'])}
          disabled={!showNextButton}
          onClick={() => onTabNextClick()}
        >
          <Icon name="svg:chevron-right" size="1rem" />
        </button>
      </div>

      <div className="flex-1">
        {tabs
          .filter(({ component }) => !!component)
          .map((tab, i) => (
            <div
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              className={cn(!fitHeight && 'h-full')}
              key={tab.label}
              style={{ display: tab.label === activeTab?.label ? 'block' : 'none' }}
            >
              {tab.component}
            </div>
          ))}

        {children}
      </div>
    </div>
  );
}
