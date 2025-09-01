// src/client/shared/components/Tabs/hooks/useTabs.ts
import type { TabItem, TabProps } from '@components/Tabs/Tabs.type';
import { useEffect, useRef, useState } from 'react';

export const useTabs = (props: TabProps) => {
  const getActiveTab = (tab?: string | TabItem | null) => {
    const activeTabs = props.items.filter(({ hidden }) => !hidden);
    const activeLabel = typeof tab === 'string' ? props.value : tab?.label;

    return activeTabs.find((t) => t.label === activeLabel) || null;
  };

  const [showBackButton, setShowBackButton] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [activeTab, setActiveTab] = useState<TabItem | null>(getActiveTab(props.value));
  const [tabs, setTabs] = useState(props.items);
  const activeIndex = useRef<number>(0);
  const tabPanelRef = useRef<HTMLDivElement | null>(null);
  const tabItemRef = useRef<(HTMLSpanElement | null)[]>([]);
  const setTabItemRefs = (i: number) => (el: HTMLSpanElement | null) => {
    tabItemRef.current[i] = el;
  };

  useEffect(() => {
    const newTabs = props.items.filter(({ hidden }) => !hidden);

    setTabs(newTabs);

    const currentActive = activeTab?.label;
    const stillExists = newTabs.some((tab) => tab.label === currentActive);

    if (!stillExists && newTabs.length > 0) {
      onTabClick(newTabs[0], 0);
    }
  }, [props.items]);

  const scrollToActiveTab = (newIndex: number) => {
    const currentActiveIndex = activeIndex.current;
    const direction = currentActiveIndex < newIndex ? 1 : -1;
    const targetIndex = newIndex + 3 * direction;
    const scrollIndex = Math.max(0, Math.min(tabs.length - 1, targetIndex));
    const scrollTarget = tabItemRef.current[scrollIndex];
    const tabPanel = tabPanelRef.current;

    if (!scrollTarget || !tabPanel) {
      return;
    }

    updateButtonVisibility(newIndex);
    scrollTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  };

  const updateButtonVisibility = (index: number = activeIndex.current) => {
    const tabPanel = tabPanelRef.current;

    if (!tabPanel) {
      return;
    }

    const hasScroll = tabPanel.scrollWidth > tabPanel.clientWidth;

    setShowBackButton(index > 0 && hasScroll);
    setShowNextButton(index < tabs.length - 1 && hasScroll);
  };

  const onTabClick = (tab: TabItem, index: number) => {
    scrollToActiveTab(index);
    setActiveTab(tab);
    tab.onClick?.(tab.label, index);
    activeIndex.current = index;
  };

  const onTabBackClick = () => {
    const currentIndex = activeIndex.current;
    const newIndex = Math.max(0, currentIndex - 1);
    const newTab = tabs[newIndex];

    if (newTab) {
      onTabClick(newTab, newIndex);
      newTab.onClick?.(newTab.label, newIndex);
    }
  };

  const onTabFocus = (tab: TabItem, index: number) => () => {
    if (!props.tabFocus) {
      return;
    }

    onTabClick(tab, index);
  };

  const onTabNextClick = () => {
    const currentIndex = activeIndex.current;
    const newIndex = Math.min(tabs.length - 1, currentIndex + 1);
    const newTab = tabs[newIndex];

    if (newTab) {
      onTabClick(newTab, newIndex);
      newTab.onClick?.(newTab.label, newIndex);
    }
  };

  useEffect(() => {
    updateButtonVisibility();
  }, [tabPanelRef]);

  return {
    tabs,
    tabPanelRef,
    setTabItemRefs,
    activeTab,
    onTabClick,
    onTabFocus,
    showBackButton,
    onTabBackClick,
    showNextButton,
    onTabNextClick,
  };
};
