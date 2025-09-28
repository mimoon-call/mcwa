// src/client/shared/hooks/useToast.tsx
import { type ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import Toast, { type ToastOptions, type ToastProps, type ToastRef } from '@components/Toast/Toast';
import Icon from '@components/Icon/Icon';
import { useTranslation } from 'react-i18next';

let openToast: null | ToastRef['open'] = null;
let mounted = false;
let globalContainer: HTMLDivElement | null = null;
let globalRoot: ReturnType<typeof createRoot> | null = null;
let lastToastContent: string | null = null;
let lastToastTime: number = 0;
let toastY: ToastProps['y'] = 'top';

// Helper function to check if toast should be shown (deduplication)
const shouldShowToast = (content: string): boolean => {
  const now = Date.now();
  const contentString = content;

  // Prevent showing the same toast content within 1 second (regardless of type)
  if (contentString === lastToastContent && now - lastToastTime < 1000) {
    return false;
  }

  lastToastContent = contentString;
  lastToastTime = now;
  return true;
};

export const useToast = (props: Partial<ToastProps> = {}) => {
  const { t } = useTranslation();
  if (props.y) toastY = props.y;

  useEffect(() => {
    if (mounted) {
      return;
    }

    // Create global container and root only once
    if (!globalContainer) {
      globalContainer = document.createElement('div');
      document.body.appendChild(globalContainer);
      globalRoot = createRoot(globalContainer);
    }

    const refHandler = (ref: ToastRef | null) => {
      if (ref && typeof ref.open === 'function') {
        openToast = ref.open;
        mounted = true;
      }
    };

    globalRoot?.render(<Toast ref={refHandler} {...props} y={props.y || toastY} />);
  }, []);

  const error = (message: string | ReactNode, { duration = 7000, link, ...options }: ToastOptions = {}) => {
    const content = typeof message === 'string' ? t(message) : message;
    const contentString = typeof content === 'string' ? content : content?.toString() || '';

    // Deduplication: prevent showing the same toast content within 1 second
    if (!shouldShowToast(contentString)) {
      return;
    }

    openToast?.(
      <div className="flex gap-1 align-middle">
        <Icon name="svg:warning" size="1.5rem" />

        <span className="self-center">{content}</span>
      </div>,
      { className: 'bg-red-50 text-red-700', duration, link, ...options }
    );
  };

  const warning = (message: string | ReactNode, { duration = 7000, link, ...options }: ToastOptions = {}) => {
    const content = typeof message === 'string' ? t(message) : message;
    const contentString = typeof content === 'string' ? content : content?.toString() || '';

    // Deduplication: prevent showing the same toast content within 1 second
    if (!shouldShowToast(contentString)) {
      return;
    }

    openToast?.(
      <div className="flex gap-1 align-middle">
        <Icon name="svg:warning" size="1.5rem" />

        <span className="self-center">{content}</span>
      </div>,
      { className: 'bg-yellow-50 text-yellow-700', duration, link, ...options }
    );
  };

  const success = (message: string | ReactNode, { link, ...options }: ToastOptions = {}) => {
    const content = typeof message === 'string' ? t(message) : message;
    const contentString = typeof content === 'string' ? content : content?.toString() || '';

    // Deduplication: prevent showing the same toast content within 1 second
    if (!shouldShowToast(contentString)) {
      return;
    }

    openToast?.(
      <div className="flex gap-1 align-middle">
        <Icon name="svg:check-circle" size="1.5rem" />

        <span className="self-center">{content}</span>
      </div>,
      { className: 'bg-green-50 text-green-700', link, ...options }
    );
  };

  return { error, success, warning };
};
