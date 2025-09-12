import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import Icon from '@components/Icon/Icon';
import { Checkbox } from '@components/Checkbox/Checkbox';
import type { InstanceChat } from '../../Chat/store/chat.types';
import { internationalPhonePrettier } from '@helpers/international-phone-prettier';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState, AppDispatch } from '@client/store';
import { chatSlice } from '../../Chat/store/chat.slice';
import { CHAT_EXTERNAL_FLAG, CHAT_CLEAR_SEARCH_DATA, CHAT_RESET_PAGINATION, CHAT_SEARCH_CONVERSATIONS } from '../../Chat/store/chat.constants';

type InstanceChatHeaderProps = {
  phoneNumber: string;
  searchMetadata?: InstanceChat | null;
};

const InstanceChatHeader: React.FC<InstanceChatHeaderProps> = ({ phoneNumber, searchMetadata }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  // Get active instances from global store
  const activeList = useSelector((state: RootState) => state[StoreEnum.global].activeList);

  // Get external flag from chat store
  const externalFlag = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_EXTERNAL_FLAG]);

  // Check if current instance is connected by checking if it exists in activeList
  const isConnected = activeList.includes(phoneNumber);

  const formattedNumber = internationalPhonePrettier(phoneNumber, '-');

  // Get chat actions
  const {
    setExternalFlag,
    [CHAT_CLEAR_SEARCH_DATA]: clearSearchData,
    [CHAT_RESET_PAGINATION]: resetPagination,
    [CHAT_SEARCH_CONVERSATIONS]: searchConversations,
  } = chatSlice;

  const handleExternalFlagChange = (checked: boolean) => {
    // Update external flag
    dispatch(setExternalFlag(checked));

    // Reset search and fetch again with new external flag
    dispatch(clearSearchData());
    dispatch(resetPagination());
    dispatch(searchConversations({ phoneNumber, externalFlag: checked }));
  };

  return (
    <div className={`${isConnected ? 'bg-green-600' : 'bg-red-600'} text-white p-4 flex flex-col`}>
      <div className="flex items-center space-x-3">
        <div className="flex flex-col gap-1">
          <div className="flex gap-2 items-center">
            <div>
              <div className="text-xl font-semibold" dir="ltr">
                {formattedNumber}
              </div>

              <div className="text-sm opacity-90">{isConnected ? t('INSTANCE.STATUS.CONNECTED') : t('INSTANCE.STATUS.DISCONNECTED')}</div>
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

      <div className="flex justify-end mt-2 pt-1 border-t text-sm">
        <Checkbox value={externalFlag} onChange={handleExternalFlagChange} label={t('INSTANCE.EXTERNAL_ONLY')} className="text-white" />
      </div>
    </div>
  );
};

export default InstanceChatHeader;
