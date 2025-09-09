import React, { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Icon from '@client/shared/components/Icon/Icon';
import { cn } from '@client/plugins';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState, AppDispatch } from '@client/store';
import chatSlice from './store/chat.slice';
import {
  CHAT_SEARCH_CONVERSATIONS,
  CHAT_GET_CONVERSATION,
  CHAT_SEARCH_DATA,
  CHAT_SEARCH_METADATA,
  CHAT_SEARCH_PAGINATION,
  CHAT_SEARCH_VALUE,
  CHAT_MESSAGES_DATA,
  CHAT_MESSAGES_PAGINATION,
  CHAT_LOADING,
  SEARCH_LOADING,
  CHAT_ERROR,
} from './store/chat.constants';
import { LeftPanel, RightPanel } from './components';

type ChatProps = {
  className?: string;
};

const Chat: React.FC<ChatProps> = ({ className }) => {
  const { t } = useTranslation();
  const { phoneNumber, withPhoneNumber } = useParams<{ phoneNumber: string; withPhoneNumber?: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  // Get data from store
  const conversations = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_DATA]) || [];
  const searchMetadata = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_METADATA]);
  const searchPagination = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_PAGINATION]);
  const searchValue = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_VALUE]);
  const messages = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_MESSAGES_DATA]) || [];
  const messagesPagination = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_MESSAGES_PAGINATION]);
  const chatLoading = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_LOADING]);
  const searchLoading = useSelector((state: RootState) => state[StoreEnum.chat][SEARCH_LOADING]);
  const error = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_ERROR]) !== null;

  // Load conversations on component mount
  useEffect(() => {
    if (phoneNumber) {
      dispatch(chatSlice.resetPagination());
      dispatch(chatSlice[CHAT_SEARCH_CONVERSATIONS]({ phoneNumber }));
    }
  }, [phoneNumber, dispatch]);

  // Load messages when a chat is selected
  useEffect(() => {
    if (withPhoneNumber && phoneNumber) {
      dispatch(
        chatSlice[CHAT_GET_CONVERSATION]({
          phoneNumber,
          withPhoneNumber,
        })
      );
    }
  }, [withPhoneNumber, phoneNumber, dispatch]);

  const selectedContact = conversations?.find((contact) => contact.phoneNumber === withPhoneNumber) || null;
  const selectedMessages = messages || [];

  const handleSendMessage = (fromNumber: string, toNumber: string, text: string) => {
    console.log('Send message:', { fromNumber, toNumber, text });
  };

  const handleChatSelect = (contactPhoneNumber: string) => {
    if (phoneNumber) {
      navigate(`/chat/${phoneNumber}/${contactPhoneNumber}`);
    }
  };

  const handleSearch = useCallback((value: string) => {
    if (phoneNumber) {
      // Only search if the value actually changed
      if (value !== searchValue) {
        // Reset pagination only if search value actually changed
        dispatch(chatSlice.resetPagination());
        
        // Clear current data and search with new value
        dispatch(chatSlice.clearSearchData());
        dispatch(chatSlice[CHAT_SEARCH_CONVERSATIONS]({ phoneNumber, searchValue: value }));
      }
    }
  }, [phoneNumber, searchValue, dispatch]);

  // Show error if phoneNumber is not provided
  if (!phoneNumber) {
    return (
      <div className={cn('flex h-screen bg-gray-100 items-center justify-center', className)}>
        <div className="text-center">
          <Icon name="svg:exclamation-triangle" size="3rem" className="text-red-500 mx-auto mb-4" />
          <div className="text-red-500 text-lg font-semibold mb-2">{t('GENERAL.ERROR')}</div>
          <div className="text-gray-600">{t('GENERAL.PHONE_NUMBER_REQUIRED')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-[calc(100vh-4rem)] bg-gray-100', className)}>
      <LeftPanel
        phoneNumber={phoneNumber}
        searchMetadata={searchMetadata}
        conversations={conversations}
        selectedPhoneNumber={withPhoneNumber}
        loading={searchLoading}
        error={error}
        hasMore={searchPagination?.hasMore || false}
        searchValue={searchValue}
        onChatSelect={handleChatSelect}
        onSearch={handleSearch}
      />
      <RightPanel
        selectedContact={selectedContact}
        messages={selectedMessages}
        disabled={!searchMetadata?.isConnected}
        loading={chatLoading}
        error={error}
        phoneNumber={phoneNumber}
        withPhoneNumber={withPhoneNumber}
        hasMore={messagesPagination?.hasMore || false}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
};

export default Chat;
