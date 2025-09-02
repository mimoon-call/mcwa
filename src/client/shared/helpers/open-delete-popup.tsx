import React from 'react';
import Button from '@components/Button/Button';
import { useTranslation } from 'react-i18next';
import { OverlayHandler } from '@components/Overlay/Overlay.handler';
import { useAsyncFn } from '@hooks/useAsyncFn';
import { useToast } from '@hooks';

type Options = {
  title?: string;
  description: string | [string, Record<string, any>?];
  callback?: () => Promise<unknown> | unknown;
  confirmText?: string;
  cancelText?: string;
  successMessage?: string;
};

export const openDeletePopup = async (options: Options) => {
  await new Promise<void>((resolve, errorCallback) => {
    const { close, create } = OverlayHandler({ closeCallback: () => resolve() });

    const OverlayContent = () => {
      const toast = useToast({ y: 'bottom' });
      const { t } = useTranslation();
      const {
        title = 'GENERAL.DELETE',
        confirmText = 'GENERAL.CONFIRM',
        cancelText = options.callback ? 'GENERAL.CANCEL' : 'GENERAL.CLOSE',
        callback,
        successMessage = 'GENERAL.ITEM_DELETE_SUCCESSFULLY',
      } = options;

      const description = Array.isArray(options.description) ? options.description[0] : options.description;
      const variables = Array.isArray(options.description) ? options.description[1] : undefined;

      const { call, loading } = useAsyncFn(callback, {
        successCallback: () => {
          if (successMessage) {
            toast.success(t(successMessage));
          }

          close();
        },
        errorCallback,
      });

      return (
        <div className="flex flex-col gap-2 p-4 bg-white shadow-2xl">
          <div className="flex flex-col justify-center gap-2 mb-4 pt-4">
            <h2 className="text-center text-2xl font-bold">{t(title)}</h2>
            <p className="text-center font-medium whitespace-pre-wrap">{t(description, variables)}</p>
          </div>

          <div className="mt-2 flex gap-2 justify-center pb-2">
            <Button className="text-red-700" loading={loading} disabled={loading || !callback} onClick={call}>
              {t(confirmText)}
            </Button>

            <Button disabled={loading} onClick={close}>
              {t(cancelText)}
            </Button>
          </div>
        </div>
      );
    };

    create(<OverlayContent />, true);
  });
};
