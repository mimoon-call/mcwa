// src/client/shared/components/Tabs/Tabs.tsx
import styles from '@components/Tabs/Tabs.module.css';
import React, { useRef } from 'react';
import { useTabs } from '@components/Tabs/hooks/useTabs';
import Icon from '@components/Icon/Icon';
import type { TabProps } from '@components/Tabs/Tabs.type';
import { cn } from '@client/plugins';

export default function Tabs({ className, panelClassName, fitHeight, ...props }: TabProps) {
  if (!props.items?.length) {
    return null;
  }

  const { tabs, tabPanelRef, setTabItemRefs, activeTab, onTabClick, onTabFocus, showBackButton, onTabBackClick, showNextButton, onTabNextClick } =
    useTabs(props);

  const tabRefs = useRef<(HTMLSpanElement | null)[]>([]);

  return (
    <div className={cn(styles['tabs'], className, !fitHeight && 'h-full')}>
      <div className={cn(styles['tab-panel'], panelClassName)}>
        <button
          className={cn(styles['tab-back-button'], showBackButton && styles['tab-back-button--shown'])}
          disabled={!showBackButton}
          onClick={() => onTabBackClick()}
        >
          <Icon name="svg:chevron-left" size="1rem" />
        </button>

        <div ref={tabPanelRef} className={cn(styles['tabs-items'])}>
          {tabs.map((tab, i) =>
            tab.hidden ? null : (
              <div className={cn(tab.label === activeTab?.label && styles['tabs-item--active'])} key={i} role="button">
                <div>
                  <span
                    ref={setTabItemRefs(i)}
                    onClick={() => onTabClick(tab, i)}
                    role="button"
                    tabIndex={props.tabFocus ? i + 1 : -1}
                    onFocus={onTabFocus(tab, i)}
                  >
                    {tab.label}
                  </span>
                </div>
              </div>
            )
          )}
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
        {tabs.map((tab, i) => (
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
      </div>
    </div>
  );
}
