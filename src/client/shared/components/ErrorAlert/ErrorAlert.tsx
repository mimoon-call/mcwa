// src/client/shared/components/ErrorAlert/ErrorAlert.tsx
import type { ErrorResponse } from '@models';
import React, { type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';

type Props = { error?: ErrorResponse | null };

const ErrorAlert: FC<Props> = ({ error }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!error) return null;

  const errors = error.errorMessage.map(({ message, redirectTo, ...params }, index) => {
    const handleRedirect = () => {
      if (!redirectTo?.path) {
        return;
      }

      const queryString = redirectTo.query ? '?' + new URLSearchParams(redirectTo.query).toString() : '';
      const fullPath = redirectTo.path + queryString;
      navigate(fullPath, { state: redirectTo.params });
    };

    return (
      <div key={index} className="text-red-700 inline-block text-nowrap text-ellipsis">
        <span>{t(message, params)}</span>
        {redirectTo && (
          <button onClick={handleRedirect} className="text-blue-600 underline ms-2 hover:opacity-80">
            {t('GENERAL.MORE_INFORMATION')}
          </button>
        )}
      </div>
    );
  });

  return (
    <div className="border-red-700 border-2 bg-red-100 text-red-700 px-2 py-1 mb-2 rounded flex">
      <div className="flex align-top pt-0.5 pe-1">
        <Icon name="svg:warning" size="1.25rem" />
      </div>

      <div className="flex flex-col font-medium space-y-1">{errors}</div>
    </div>
  );
};

export default ErrorAlert;
