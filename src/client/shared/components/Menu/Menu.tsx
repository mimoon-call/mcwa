// src/client/shared/components/Menu/Menu.tsx
import type { MenuProps } from '@components/Menu/Menu.type';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover } from '@components/Popover/Popover';
import Icon from '@components/Icon/Icon';
import { useAsyncFn } from '@hooks/useAsyncFn';
import Spinner from '@components/Spinner/Spinner';
import type { PopoverProps } from '@components/Popover/Popover.type';
import { useExposeRef } from '@hooks/useExposeRef';
import { cn } from '@client/plugins';
import { useTooltip } from '@hooks';

const MenuList: FC<{ items: MenuProps['items']; popoverRef: PopoverProps['ref'] }> = (props) => {
  const { t } = useTranslation();

  const items = props.items.map(({ onClick, disabled, ...rest }) => {
    const { call, loading } = useAsyncFn(onClick, {
      successCallback: () => {
        setTimeout(() => props.popoverRef?.current?.close?.(), 300);
      },
    });

    const isDisabled = typeof disabled === 'function' ? disabled() : disabled;

    return { ...rest, loading, disabled: isDisabled, onClick: !isDisabled ? call : undefined };
  });

  return items.map(({ type, label, iconName, disabled, loading, className, onClick }, index) => {
    const hasLoading = items.some(({ loading }) => loading);

    if (type === 'divider') return <hr key={index} className="border-t" />;

    return (
      <div
        key={index}
        className={cn('flex gap-2 align-middle px-2 py-1', disabled || hasLoading ? 'opacity-50' : 'cursor-pointer hover:bg-slate-100', className)}
        {...(!disabled && !hasLoading ? { role: 'button' } : {})}
        tabIndex={disabled ? -1 : 0}
        onClick={!hasLoading ? onClick : undefined}
      >
        {iconName && (
          <div className="relative flex items-center justify-center">
            {loading && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Spinner size="2rem" />
              </div>
            )}
            <Icon className={cn(loading && 'opacity-25')} size="1rem" name={iconName} />
          </div>
        )}

        <div className="grow">{typeof label === 'string' ? t(label) : label}</div>
      </div>
    );
  });
};

export const Menu: FC<MenuProps> = ({ activator, items, showSingleAction, className, ...props }: MenuProps) => {
  const { t } = useTranslation();
  const popoverRef = useExposeRef<PopoverProps>();
  const showSingleItem = items.length === 1 && !!showSingleAction;

  if (showSingleItem) {
    const { label, iconName, onClick } = items[0]!;
    const { call, loading } = useAsyncFn(onClick, {});
    const actionRef = useTooltip<HTMLDivElement>({ text: typeof label === 'string' ? t(label) : undefined });

    return (
      <div ref={actionRef} className="relative flex items-center justify-center">
        {loading && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <Spinner size="2rem" />
          </div>
        )}

        <Icon className={cn(loading && 'opacity-25')} size="1rem" name={iconName!} onClick={call} />
      </div>
    );
  }

  return (
    <Popover activator={activator} {...props} ref={popoverRef}>
      <div className={cn('flex flex-col gap-2 border-2 p-2', className)}>
        <MenuList items={items} popoverRef={popoverRef} />
      </div>
    </Popover>
  );
};
