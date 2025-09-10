import type { ChatMessage, ChatContact, ConversationPairItem } from './store/chat.types';
import type { RootState, AppDispatch } from '@client/store';
import React, { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Icon from '@components/Icon/Icon';
import { cn } from '@client/plugins';
import { StoreEnum } from '@client/store/store.enum';
import chatSlice from './store/chat.slice';
import {
  CHAT_SEARCH_CONVERSATIONS,
  CHAT_GET_CONVERSATION,
  CHAT_SEARCH_DATA,
  CHAT_SEARCH_METADATA,
  CHAT_SEARCH_VALUE,
  CHAT_MESSAGES_DATA,
  CHAT_MESSAGES_PAGINATION,
  CHAT_LOADING,
  SEARCH_LOADING,
  CHAT_ERROR,
  CHAT_UPDATE_MESSAGE_STATUS,
  CHAT_RESET_PAGINATION,
  CHAT_CLEAR_SEARCH_DATA,
  CHAT_ADD_INCOMING_MESSAGE,
  CHAT_ADD_NEW_CONVERSATION,
  CHAT_SEND_MESSAGE,
} from './store/chat.constants';
import { ChatLeftPanel, ChatRightPanel, InstanceChatHeader, InstanceChatListItem, ChatHeader } from './components';
import getClientSocket from '@helpers/get-client-socket.helper';
import { ConversationEventEnum } from '../Chat/store/chat-event.enum';

type ChatProps = {
  className?: string;
};

// Global flag to prevent multiple simultaneous calls
let isSearchingGlobally = false;

const InstanceChat: React.FC<ChatProps> = ({ className }) => {
  const { t } = useTranslation();
  const { phoneNumber, withPhoneNumber } = useParams<{ phoneNumber: string; withPhoneNumber?: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const lastPhoneNumberRef = useRef<string>('');
  const lastSearchValueRef = useRef<string>('');

  // Get data from store
  const conversations = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_DATA]) || [];
  const searchMetadata = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_METADATA]);
  const searchValue = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_VALUE]);
  const messages = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_MESSAGES_DATA]) || [];
  const messagesPagination = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_MESSAGES_PAGINATION]);
  const chatLoading = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_LOADING]);
  const searchLoading = useSelector((state: RootState) => state[StoreEnum.chat][SEARCH_LOADING]);
  const error = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_ERROR]) !== null;

  // Load conversations on component mount (only when no specific chat is selected)
  useEffect(() => {
    if (phoneNumber && !withPhoneNumber) {
      // Only search if the phone number actually changed from the last search and we're not already searching globally
      if (phoneNumber !== lastPhoneNumberRef.current && !isSearchingGlobally) {
        // Update the ref to track the last searched phone number
        lastPhoneNumberRef.current = phoneNumber;
        isSearchingGlobally = true;
        
        dispatch(chatSlice[CHAT_RESET_PAGINATION]());
        dispatch(chatSlice[CHAT_SEARCH_CONVERSATIONS]({ phoneNumber })).finally(() => {
          isSearchingGlobally = false;
        });
      }
    }
  }, [phoneNumber, withPhoneNumber, dispatch]);

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

  // Listen for new message events
  useEffect(() => {
    const socket = getClientSocket();

    const handleNewMessage = (messageData: ChatMessage) => {
      // Check if this message belongs to the currently active chat
      if (!phoneNumber || !withPhoneNumber) return;

      const isActiveChat =
        (messageData.fromNumber === phoneNumber && messageData.toNumber === withPhoneNumber) ||
        (messageData.fromNumber === withPhoneNumber && messageData.toNumber === phoneNumber);

      if (isActiveChat) {
        // The Redux slice will handle deduplication
        dispatch(chatSlice[CHAT_ADD_INCOMING_MESSAGE](messageData));
      }
    };

    const handleNewConversation = (conversationData: Partial<ConversationPairItem>) => {
      // Only add/update conversation if instanceNumber equals phoneNumber from params
      if (conversationData.instanceNumber === phoneNumber) {
        // Transform the received object to match ChatContact type, only including non-empty values
        const chatContact: Partial<ChatContact> = {
          phoneNumber: conversationData.phoneNumber,
          ...(conversationData.lastMessage && { lastMessage: conversationData.lastMessage }),
          ...(conversationData.lastMessageAt && { lastMessageAt: conversationData.lastMessageAt }),
        };

        dispatch(chatSlice[CHAT_ADD_NEW_CONVERSATION](chatContact));
      }
    };

    const handleMessageStatusUpdate = (statusData: {
      messageId: string;
      status: string;
      sentAt?: string;
      deliveredAt?: string;
      readAt?: string;
      playedAt?: string;
      errorCode?: number;
      errorMessage?: string;
    }) => {
      dispatch(chatSlice[CHAT_UPDATE_MESSAGE_STATUS](statusData));
    };

    socket?.on(ConversationEventEnum.NEW_MESSAGE, handleNewMessage);
    socket?.on(ConversationEventEnum.NEW_CONVERSATION, handleNewConversation);
    socket?.on(ConversationEventEnum.MESSAGE_STATUS_UPDATE, handleMessageStatusUpdate);

    return () => {
      socket?.off(ConversationEventEnum.NEW_MESSAGE, handleNewMessage);
      socket?.off(ConversationEventEnum.NEW_CONVERSATION, handleNewConversation);
      socket?.off(ConversationEventEnum.MESSAGE_STATUS_UPDATE, handleMessageStatusUpdate);
    };
  }, [phoneNumber, withPhoneNumber, dispatch]);

  const selectedContact = conversations?.find((contact) => contact.phoneNumber === withPhoneNumber) || null;
  const selectedMessages = messages || [];

  const handleSendMessage = async (fromNumber: string, toNumber: string, text: string) => {
    if (!text.trim()) return;

    await chatSlice[CHAT_SEND_MESSAGE]({
      fromNumber: fromNumber,
      toNumber: toNumber,
      textMessage: text.trim(),
    });
  };

  const handleChatSelect = (contactPhoneNumber: string) => {
    if (phoneNumber) {
      navigate(`/instance/${phoneNumber}/${contactPhoneNumber}`);
    }
  };

  const handleSearch = useCallback(
    (value: string) => {
      if (phoneNumber) {
        // Only search if the value actually changed from the last search and we're not already searching globally
        if (value !== lastSearchValueRef.current && !isSearchingGlobally) {
          // Update the ref to track the last searched value
          lastSearchValueRef.current = value;
          isSearchingGlobally = true;
          
          // Reset pagination only if search value actually changed
          dispatch(chatSlice[CHAT_RESET_PAGINATION]());

          // Clear current data and search with new value
          dispatch(chatSlice[CHAT_CLEAR_SEARCH_DATA]());
          dispatch(chatSlice[CHAT_SEARCH_CONVERSATIONS]({ phoneNumber, searchValue: value })).finally(() => {
            isSearchingGlobally = false;
          });
        }
      }
    },
    [phoneNumber, dispatch]
  );

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
    <div className={cn('flex h-full bg-gray-100', className)}>
      <ChatLeftPanel
        items={conversations}
        selectedItem={selectedContact}
        loading={searchLoading}
        error={error}
        searchValue={searchValue}
        onItemSelect={(contact) => handleChatSelect(contact.phoneNumber)}
        onSearch={handleSearch}
        headerComponent={<InstanceChatHeader phoneNumber={phoneNumber} searchMetadata={searchMetadata} />}
        itemComponent={(contact, isSelected, onClick) => <InstanceChatListItem contact={contact} isSelected={isSelected} onClick={onClick} />}
        getItemKey={(contact) => contact.phoneNumber}
        isItemSelected={(contact, selectedContact) => selectedContact?.phoneNumber === contact.phoneNumber}
      />
      <ChatRightPanel
        selectedContact={selectedContact}
        messages={selectedMessages}
        disabled={!searchMetadata?.isConnected}
        loading={chatLoading}
        error={error}
        phoneNumber={phoneNumber}
        withPhoneNumber={withPhoneNumber}
        hasMore={messagesPagination?.hasMore || false}
        headerComponent={selectedContact ? <ChatHeader contact={selectedContact} /> : undefined}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
};

export default InstanceChat;
