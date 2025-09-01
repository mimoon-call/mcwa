import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import styles from './Overlay.module.css';
import Icon from '@components/Icon/Icon';
import { OverlayEnum } from '@components/Overlay/Overlay.enum';
import { emitter, esc } from '@client/App';
import { getLastZIndex } from '@helpers/get-last-z-index';
import { uniqueKey } from '@helpers/unique-key';
import type { OverlayProps, OverlayRef } from '@components/Overlay/Overlay.type';
import { useAsyncFn } from '@hooks/useAsyncFn';
import Spinner from '@components/Spinner/Spinner';
import { cn } from '@client/plugins';
import { createPortal } from 'react-dom';

const Overlay = forwardRef<OverlayRef, OverlayProps>((props, ref) => {
  const { size = OverlayEnum.SM, children, fitContent, className, style, hideCloseButton } = props;
  const id = useRef<string>(uniqueKey(Date.now()));
  const [isShown, setShown] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const containerRef = useRef(null);

  const { loading: openLoading, call: openCallback } = useAsyncFn(props.openCallback || ((() => {}) as () => Promise<void>), {});
  const { call: closeCallback } = useAsyncFn(props.closeCallback || ((() => {}) as () => Promise<void>), {});

  const getContentStyle = () => {
    const style = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const computedHeight = props.fitContent ? 'fit-content' : props.height;
    const computedWidth = props.width;

    if (size) {
      return style;
    }

    return { width: computedWidth || '100vw', height: computedHeight || '100vh' };
  };

  const open = useCallback(
    async (...arg: unknown[]) => {
      setOpen(true);
      setTimeout(() => setShown(true), 500);

      if (!props.disableEscape) {
        id.current = uniqueKey(Date.now());
        esc.add(id.current, close);
      }

      await openCallback(...arg);
    },
    [props.openCallback]
  );

  const close = useCallback(
    async (...arg: unknown[]) => {
      await closeCallback(...arg);
      setShown(false);
      setTimeout(() => setOpen(false), 500);
      esc.remove(id.current);
    },
    [props.closeCallback]
  );

  useEffect(() => {
    if (props.openEvent) {
      emitter.on(props.openEvent, open);
    }

    if (props.closeEvent) {
      emitter.on(props.closeEvent, close);
    }

    return () => {
      if (props.openEvent) {
        emitter.off(props.openEvent, open);
      }

      if (props.closeEvent) {
        emitter.off(props.closeEvent, close);
      }
    };
  }, [props.openEvent, props.closeEvent, open, close]);

  useEffect(() => {
    const appElement = document.getElementById('root');

    if (appElement && isOpen) {
      appElement.setAttribute('inert', 'true');
      appElement.setAttribute('aria-hidden', 'true');
    } else if (appElement) {
      appElement.removeAttribute('inert');
      appElement.removeAttribute('aria-hidden');
    }

    return () => {
      if (appElement) {
        appElement.removeAttribute('inert');
        appElement.removeAttribute('aria-hidden');
      }
    };
  }, [isOpen]);

  useImperativeHandle(ref, () => ({ open, close }), [open, close]);

  return isOpen
    ? createPortal(
        <div
          tabIndex={-1}
          className={cn('fixed inset-0 flex', !isShown && 'opacity-0 pointer-events-none', styles['overlay'])}
          style={{ zIndex: getLastZIndex() }}
        >
          <div
            ref={containerRef}
            className={cn(
              styles['modal'],
              !openLoading && styles['modal__content'],
              size && styles[size.toLowerCase()],
              fitContent && 'fit-height',
              className
            )}
            style={{ ...getContentStyle(), ...style }}
          >
            {openLoading ? (
              <div className="flex items-center justify-center flex-grow min-h-[320px]">
                <Spinner size="96px" />
              </div>
            ) : (
              children
            )}

            {!hideCloseButton && !openLoading && (
              <div className={styles['modal__close-button']} onClick={() => close()}>
                <Icon name="svg:x-mark" />
              </div>
            )}
          </div>
        </div>,
        document.body
      )
    : null;
});

Overlay.displayName = 'Overlay';

export default Overlay;
