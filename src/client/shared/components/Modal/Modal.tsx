import type { ModalProps, ModalRef } from '@components/Modal/Modal.types';
import type { OverlayRef } from '@components/Overlay/Overlay.type';
import type { FormRef } from '@components/Form/Form.types';
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import Overlay from '@components/Overlay/Overlay';
import Button from '@components/Button/Button';
import { useTranslation } from 'react-i18next';
import { useAsyncFn } from '@hooks/useAsyncFn';
import { emitter } from '@client/App';
import ErrorAlert from '@components/ErrorAlert/ErrorAlert';
import { cn } from '@client/plugins';
import Form from '@components/Form/Form';

const Modal = forwardRef<ModalRef, ModalProps>((props, ref) => {
  const { t } = useTranslation();
  const overlayRef = useRef<OverlayRef>(null);

  const {
    title,
    subtitle,
    submitText = 'GENERAL.SUBMIT',
    cancelText = 'GENERAL.CANCEL',
    hideCancelButton,
    children,
    openEvent,
    closeEvent,
    additionalActions,
    hideContentDivider,
    hideHeaderDivider,
    openCallback,
    sidePanel,
    submitCallback,
    cancelCallback = () => overlayRef.current?.close(),
    ...overlayProps
  } = props;

  const { loading: submitLoading, call: onSubmitCallback, error: submitError } = useAsyncFn(submitCallback, {});
  const { loading: cancelLoading, call: onCancel } = useAsyncFn(cancelCallback, {});
  const { call: openCallbackWrapped, error: openCallbackError } = useAsyncFn(openCallback);

  const onSubmit = () => {
    if (!formRef.current?.validate()) {
      return;
    }

    return onSubmitCallback();
  };

  const formRef = useRef<FormRef>(null);

  useImperativeHandle(ref, () => ({
    open: (...args: unknown[]) => {
      if (openEvent) {
        emitter.emit(openEvent, ...args);
      } else {
        overlayRef.current?.open(...args);
      }
    },
    close: (...args: unknown[]) => {
      if (closeEvent) {
        emitter.emit(closeEvent, ...args);
      } else {
        overlayRef.current?.close(...args);
      }
    },
    validate: () => !!formRef.current?.validate(),
  }));

  const isHeaderShown = title || subtitle || submitError || openCallbackError;

  return (
    <Overlay ref={overlayRef} openEvent={openEvent} closeEvent={closeEvent} openCallback={openCallbackWrapped} {...overlayProps}>
      <div className="flex h-full w-full py-4 bg-secondary">
        {sidePanel && <div className="basis-1/3 border-e-2 px-4 overflow-y-auto">{sidePanel}</div>}

        <div className={cn('flex flex-col h-full w-full px-4', !title && !subtitle && 'pt-4')}>
          {isHeaderShown && (
            <div className={cn('flex flex-col mb-2', !hideHeaderDivider && 'border-b-2')}>
              {title && <h1 className="text-2xl font-semibold mb-1">{typeof title === 'string' ? t(title) : title}</h1>}
              {subtitle && <p className="text-base font-medium mb-2">{typeof subtitle === 'string' ? t(subtitle) : subtitle}</p>}
              {(submitError || openCallbackError) && <ErrorAlert error={submitError || openCallbackError} />}
            </div>
          )}

          <Form ref={formRef} className="flex-grow overflow-y-auto" onSubmit={onSubmit}>
            {children}
          </Form>

          <div className={cn('flex gap-2 pt-2 mt-2', additionalActions ? 'justify-between' : 'justify-end', !hideContentDivider && 'border-t-2')}>
            {additionalActions}

            <div className="flex gap-2">
              {!hideCancelButton && (
                <Button disabled={submitLoading || cancelLoading} loading={cancelLoading} onClick={onCancel}>
                  {t(submitCallback ? cancelText : 'GENERAL.CLOSE')}
                </Button>
              )}

              {submitCallback && (
                <Button disabled={submitLoading || cancelLoading} loading={submitLoading} onClick={onSubmit}>
                  {t(submitText)}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
});

Modal.displayName = 'Modal';

export default Modal;
