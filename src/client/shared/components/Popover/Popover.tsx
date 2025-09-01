// src/client/shared/components/Popover/Popover.tsx
import type { IconName } from '@components/Icon/Icon.type';
import type { PopoverProps } from '@components/Popover/Popover.type';
import React, { type CSSProperties, type FC, useLayoutEffect, useCallback, useEffect, useRef, useState } from 'react';
import styles from './Popover.module.css';
import { useTranslation } from 'react-i18next';
import { getLastZIndex } from '@helpers/get-last-z-index';
import Icon from '@components/Icon/Icon';
import { esc } from '@client/App';
import { uniqueKey } from '@helpers/unique-key';
import { isRtl } from '@helpers/is-rtl';
import { useTooltip } from '@hooks/useTooltip';
import { useExposeRef } from '@hooks/useExposeRef';
import { cn } from '@client/plugins';

export const Popover: FC<PopoverProps> = (props: PopoverProps) => {
  const { t } = useTranslation();
  const { ariaLabel = 'GENERAL.ACTIONS', closeTimeout = 0, offsetX = 4, offsetY = 0 } = props;
  const popoverRef = useTooltip<HTMLDivElement>({ text: props.tooltip ? t(props.tooltip) : undefined });

  const activator = (() => {
    if (!props.activator || typeof props.activator === 'string') {
      return <Icon name={(props.activator || 'svg:menu') as IconName} />;
    }

    return props.activator;
  })();

  const id = useRef(uniqueKey(Date.now()));
  const zIndex = useRef<number>(getLastZIndex());
  const [isActive, setActive] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const debounceId = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [style, setStyle] = useState<CSSProperties>({});

  const close = useCallback(() => {
    setActive(false);
    window.removeEventListener('click', onClose);
    window.removeEventListener('touchstart', onClose);
    esc.remove(id.current);
  }, []);

  const onClose = useCallback(
    (e: Event) => {
      const target = e.target as Node;

      if (popoverRef?.current?.contains(target) || contentRef.current?.contains(target)) {
        return;
      }

      close();
    },
    [close]
  );

  const onOpen = useCallback(
    (e?: Event) => {
      e?.preventDefault();

      if (isActive) {
        close();
        return;
      }

      setActive(true);
      zIndex.current = getLastZIndex();

      window.addEventListener('click', onClose);
      window.addEventListener('touchstart', onClose);

      if (closeTimeout) {
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(close, closeTimeout);
      }

      id.current = uniqueKey(Date.now());
      esc.add(id.current, close);
    },
    [props.disabled, isActive, close, onClose, closeTimeout]
  );

  const onHover = (hovering: boolean) => {
    if (props.hover) {
      clearTimeout(debounceId.current);
      debounceId.current = setTimeout(() => setActive(hovering), 500);
    }
  };

  useLayoutEffect(() => {
    if (!isActive) return;

    const act = popoverRef?.current;
    const content = contentRef.current;

    if (!act || !content) return;

    const actRect = act.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    const contentWidth = contentRect.width;
    const contentHeight = contentRect.height;

    // Center horizontally under activator
    const activatorCenter = actRect.left + actRect.width / 2;
    let left = activatorCenter - contentWidth / 2 + offsetX;

    if (isRtl()) {
      // Mirror the alignment by flipping the offset
      left = activatorCenter - contentWidth / 2 - offsetX;
    }

    let top = actRect.top + actRect.height + 4 + offsetY;

    // Flip to top if overflowing bottom
    if (top + contentHeight > winHeight) {
      top = actRect.top - contentHeight - 8;
    }

    // Clamp within viewport
    if (left + contentWidth > winWidth) {
      left = winWidth - contentWidth - 8;
    }
    if (left < 8) {
      left = 8;
    }
    if (top < 8) {
      top = 8;
    }

    setStyle({
      top: `${top}px`,
      left: `${left}px`,
      zIndex: zIndex.current,
      maxHeight: `${winHeight - top - 16}px`,
      position: 'fixed',
      ...(props.fitWidth ? { width: `${actRect.width}px` } : {}),
    });
  }, [isActive, offsetX, offsetY, props.fitWidth]);

  useEffect(() => {
    (props.isActive ? onOpen : close)();
  }, [props.isActive]);

  useExposeRef(props, { close, open: onOpen });

  return (
    <div className={styles['popover']}>
      <div
        ref={popoverRef}
        role={!props.disabled ? 'button' : undefined}
        aria-label={t(ariaLabel)}
        className={cn('my-auto h-full', styles['activator'], props.disabled && styles['disabled'])}
        onMouseOver={() => onHover(true)}
        onMouseOut={() => onHover(false)}
        onClick={(e) => onOpen(e.nativeEvent)}
      >
        {activator}
      </div>

      {isActive && (
        <div
          ref={contentRef}
          className={cn(
            styles['content'],
            props.fitWidth ? 'animate-zoomDown origin-top' : `animate-zoomIn origin-top-${isRtl() ? 'left' : 'right'}`
          )}
          style={style}
          onMouseOver={() => onHover(true)}
          onMouseOut={() => onHover(false)}
        >
          {props.children}
        </div>
      )}
    </div>
  );
};
