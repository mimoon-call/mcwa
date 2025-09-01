// src/client/shared/components/Toast/Toast.tsx
import React, { forwardRef, type ReactNode, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '@components/Toast/Toast.module.css';
import { cn } from '@client/plugins';
import { getLastZIndex } from '@helpers/get-last-z-index';
import { uniqueKey } from '@helpers/unique-key';
import Icon from '@components/Icon/Icon';
import type { ClassValue } from 'clsx';
import { esc } from '@client/App';

type ToastEntry = {
  id: string;
  content: ReactNode;
  duration?: number;
  top?: number;
  bottom?: number;
  className?: ClassValue;
  closeable?: boolean;
};

type ToastItemProps = ToastEntry & {
  y: ToastProps['y'];
  onRef?: (el: HTMLDivElement | null) => void;
  onClose: (id: ToastEntry['id']) => void;
};

export type ToastProps = { duration?: number; y: 'top' | 'bottom' };
export type ToastRef = { open: (content: string | ReactNode, options: ToastOptions) => void };
export type ToastOptions = Pick<ToastEntry, 'duration' | 'className' | 'closeable'>;

const MAX_VISIBLE = 3;
const TRANSITION_DURATION = 500;

const Item: React.FC<ToastItemProps> = (props) => {
  const { id, content, y, top, bottom, duration = 5000, closeable = true, className, onRef } = props;
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onClose = () => {
    props.onClose(id);
    esc.remove(id);
    clearTimeout(timeoutRef.current);
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      setVisible(true);

      if (closeable) {
        esc.add(id, onClose, 1);
      }
    });

    timeoutRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, TRANSITION_DURATION);
    }, duration);

    return () => {
      onClose();
    };
  }, []);

  return (
    <div
      ref={onRef}
      className={cn(styles['toast'], visible && styles['toast--visible'])}
      style={{ [y]: `${top || bottom}px`, zIndex: getLastZIndex() }}
    >
      <div
        className={cn(
          'shadow-2xl border-2 border-current pb-2 px-4 h-full w-full rounded font-medium',
          closeable ? 'pt-2' : 'pt-1',
          className,
          'overflow-hidden'
        )}
      >
        {closeable && (
          <div className={cn(styles['toast-close'], 'absolute top-1 rtl:right-1 ltr:left-1')}>
            <Icon name="svg:x-mark" size="1rem" onClick={onClose} />
          </div>
        )}

        <div className="py-2 whitespace-pre-line">{content}</div>

        <div className={styles['toast-progress']} style={{ animationDuration: `${duration}ms` }} />
      </div>
    </div>
  );
};

const Toast = forwardRef<ToastRef, Partial<ToastProps>>(({ duration = 3000, y = 'top' }, ref) => {
  const [activeToast, setActiveToast] = useState<Array<ToastEntry>>([]);
  const queueRef = useRef<Array<ToastEntry>>([]);
  const elHeights = useRef<Record<ToastEntry['id'], number>>({});

  const showNextToast = () => {
    if (queueRef.current.length > 0 && activeToast.length < MAX_VISIBLE) {
      const next = queueRef.current.shift()!;
      setActiveToast((prev) => [...prev, next]);
    }
  };

  const addToastQueue = useCallback((content: string | ReactNode, options: ToastOptions) => {
    const key = Date.now() + Math.random().toString(36).substring(2, 15);
    queueRef.current.push({ id: uniqueKey(key), content: typeof content === 'string' ? <span>{content}</span> : content, ...options });

    setActiveToast((prev) => {
      if (prev.length < MAX_VISIBLE) {
        const next = queueRef.current.shift();

        return next ? [...prev, next] : prev;
      }

      return prev;
    });
  }, []);

  const removeToast = (removeId: ToastEntry['id']) => {
    setActiveToast((prev) => prev.filter(({ id }) => id !== removeId));
    delete elHeights.current[removeId];

    setTimeout(() => {
      showNextToast();
    }, 500);
  };

  const handleToastRef = (id: ToastEntry['id']) => (el: HTMLDivElement | null) => {
    elHeights.current[id] = el?.offsetHeight || 0;
  };

  const getToastY = (toast: ToastEntry) => {
    const index = activeToast.findIndex(({ id }) => id === toast.id);

    return activeToast.slice(0, index).reduce((acc, { id }) => acc + (elHeights.current[id] || 0) + 8, 60);
  };

  if (typeof window === 'undefined') {
    return null;
  }

  useImperativeHandle(ref, () => ({ open: addToastQueue }));

  return createPortal(
    <div className={cn(styles['toast-container'], `${y}-0`)} style={{ zIndex: getLastZIndex() }}>
      {activeToast.map((toast) => {
        const props = { ...toast, [y]: getToastY(toast) };

        return <Item key={toast.id} duration={duration} y={y} {...props} onClose={removeToast} onRef={handleToastRef(toast.id)} />;
      })}
    </div>,
    document.body
  );
});

Toast.displayName = 'Toast';

export default Toast;
