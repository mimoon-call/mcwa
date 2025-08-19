// src/client/shared/hooks/useToast.tsx
import { ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import Toast, { type ToastOptions, type ToastProps, type ToastRef } from '@components/Toast/Toast';
import Icon from '@components/Icon/Icon';
import { useTranslation } from 'react-i18next';

let openToast: null | ToastRef['open'] = null;
let mounted = false;

export const useToast = (props: Partial<ToastProps> = {}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (mounted) {
      return;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const refHandler = (ref: ToastRef | null) => {
      if (ref && typeof ref.open === 'function') {
        openToast = ref.open;
        mounted = true;
      }
    };

    root.render(<Toast ref={refHandler} {...props} />);
  }, []);

  const error = (message: string | ReactNode, options: ToastOptions = {}) => {
    const content = typeof message === 'string' ? t(message) : message;

    openToast?.(
      <div className="flex gap-1 align-middle">
        <Icon name="svg:warning" size="1.5rem" />

        <span className="self-center">{content}</span>
      </div>,
      { className: 'bg-red-50 text-red-700', ...options }
    );
  };

  const success = (message: string | ReactNode, options: ToastOptions = {}) => {
    const content = typeof message === 'string' ? t(message) : message;

    openToast?.(
      <div className="flex gap-1 align-middle">
        <Icon name="svg:check-circle" size="1.5rem" />

        <span className="self-center">{content}</span>
      </div>,
      { className: 'bg-green-50 text-green-700', ...options }
    );
  };

  return { error, success };
};
