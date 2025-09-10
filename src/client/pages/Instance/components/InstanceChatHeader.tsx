import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';
import type { InstanceChat } from '../store/chat.types';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';

type InstanceChatHeaderProps = {
  phoneNumber: string;
  searchMetadata?: InstanceChat | null;
};

const InstanceChatHeader: React.FC<InstanceChatHeaderProps> = ({ phoneNumber, searchMetadata }) => {
  const { t } = useTranslation();

  const formattedNumber = internationalPhonePrettier(phoneNumber, '-');

  return (
    <div className={`${searchMetadata?.isConnected ? 'bg-green-600' : 'bg-red-600'} text-white p-4 flex items-center justify-between`}>
      <div className="flex items-center space-x-3">
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 items-center">
            <div>
              <div className="text-xl font-semibold" dir="ltr">
                {formattedNumber}
              </div>

              <div className="text-sm opacity-90">
                {searchMetadata?.isConnected ? t('INSTANCE.STATUS.CONNECTED') : t('INSTANCE.STATUS.DISCONNECTED')}
              </div>
            </div>
          </div>

          {searchMetadata?.errorMessage && (
            <div className="flex gap-0.5 items-center">
              <Icon className="inline text-yellow-300 me-1 mt-1" name="svg:warning" size="0.875rem" />
              <div className="text-sm opacity-75 mt-1">
                {searchMetadata.statusCode && `${t('INSTANCE.STATUS_CODE')}: ${searchMetadata.statusCode}`}
                {searchMetadata.statusCode && ' | '}
                {t('INSTANCE.ERROR_MESSAGE')}: {searchMetadata.errorMessage}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstanceChatHeader;
