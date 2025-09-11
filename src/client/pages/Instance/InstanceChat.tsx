import type { ChatMessage } from '../Chat/store/chat.types';
import type { ChatContact, ConversationPairItem } from './store/chat.types';
import { MessageStatusEnum } from '../Chat/store/chat.enum';
import type { RootState, AppDispatch } from '@client/store';
import React, { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
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
  CHAT_LOADING,
  SEARCH_LOADING,
  CHAT_ERROR,
  CHAT_UPDATE_MESSAGE_STATUS,
  CHAT_RESET_PAGINATION,
  CHAT_CLEAR_SEARCH_DATA,
  CHAT_ADD_INCOMING_MESSAGE,
  CHAT_ADD_NEW_CONVERSATION,
  CHAT_ADD_OPTIMISTIC_MESSAGE,
  CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS,
} from './store/chat.constants';
import { ChatLeftPanel, ChatRightPanel, InstanceChatHeader, InstanceChatListItem, ChatHeader } from './components';
import getClientSocket from '@helpers/get-client-socket.helper';
import { joinConversationRoom, leaveConversationRoom } from '@helpers/room.helper';
import { ConversationEventEnum } from '../Chat/store/chat-event.enum';

type ChatProps = {
  className?: string;
};

const InstanceChat: React.FC<ChatProps> = ({ className }) => {
  const { t } = useTranslation();
  const { phoneNumber, withPhoneNumber } = useParams<{ phoneNumber: string; withPhoneNumber?: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const lastSearchValueRef = useRef<string>('');

  // Get data from store
  const conversations = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_DATA]) || [];
  const searchMetadata = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_METADATA]);
  const searchValue = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_SEARCH_VALUE]);
  const messages = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_MESSAGES_DATA]) || [];
  const chatLoading = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_LOADING]);
  const searchLoading = useSelector((state: RootState) => state[StoreEnum.chat][SEARCH_LOADING]);
  const error = useSelector((state: RootState) => state[StoreEnum.chat][CHAT_ERROR]) !== null;
  
  // Get active instances from global store
  const activeList = useSelector((state: RootState) => state[StoreEnum.global].activeList);

  // Load conversations on component mount
  useEffect(() => {
    if (phoneNumber && !withPhoneNumber) {
      dispatch(chatSlice[CHAT_RESET_PAGINATION]());
      dispatch(chatSlice[CHAT_SEARCH_CONVERSATIONS]({ phoneNumber }));
    }
  }, [phoneNumber, withPhoneNumber, dispatch]);

  // Load messages when a chat is selected and join conversation room
  useEffect(() => {
    if (withPhoneNumber && phoneNumber) {
      // Join the conversation room for live updates
      joinConversationRoom(phoneNumber, withPhoneNumber);

      dispatch(
        chatSlice[CHAT_GET_CONVERSATION]({
          phoneNumber,
          withPhoneNumber,
        })
      );
    }

    // Cleanup: leave conversation room when component unmounts or chat changes
    return () => {
      if (withPhoneNumber && phoneNumber) {
        leaveConversationRoom(phoneNumber, withPhoneNumber);
      }
    };
  }, [withPhoneNumber, phoneNumber, dispatch]);

  // Listen for new message events
  useEffect(() => {
    const socket = getClientSocket();

    const handleNewMessage = (messageData: ChatMessage) => {
      dispatch(chatSlice[CHAT_ADD_INCOMING_MESSAGE](messageData));
    };

    const handleNewConversation = (conversationData: Partial<ConversationPairItem>) => {
      if (conversationData.instanceNumber === phoneNumber) {
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

    const handleMessageSent = (response: { success: boolean; tempId: string; returnCode?: number; error?: string }) => {
      if (response.success) {
        dispatch(
          chatSlice[CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS]({
            tempId: response.tempId,
            status: MessageStatusEnum.DELIVERED,
          })
        );
      } else {
        dispatch(
          chatSlice[CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS]({
            tempId: response.tempId,
            status: MessageStatusEnum.ERROR,
            errorMessage: response.error || 'Failed to send message',
          })
        );
      }
    };

    socket?.on(ConversationEventEnum.NEW_MESSAGE, handleNewMessage);
    socket?.on(ConversationEventEnum.NEW_CONVERSATION, handleNewConversation);
    socket?.on(ConversationEventEnum.MESSAGE_STATUS_UPDATE, handleMessageStatusUpdate);
    socket?.on(ConversationEventEnum.MESSAGE_SENT, handleMessageSent);

    return () => {
      socket?.off(ConversationEventEnum.NEW_MESSAGE, handleNewMessage);
      socket?.off(ConversationEventEnum.NEW_CONVERSATION, handleNewConversation);
      socket?.off(ConversationEventEnum.MESSAGE_STATUS_UPDATE, handleMessageStatusUpdate);
      socket?.off(ConversationEventEnum.MESSAGE_SENT, handleMessageSent);
    };
  }, [phoneNumber, withPhoneNumber, dispatch]);

  const selectedContact = conversations?.find((contact) => contact.phoneNumber === withPhoneNumber) || null;

  // Check if current instance is connected
  const isInstanceConnected = phoneNumber ? activeList.includes(phoneNumber) : false;

  const handleSendMessage = async (fromNumber: string, toNumber: string, text: string) => {
    if (!text.trim()) return;

    const trimmedText = text.trim();
    const tempId = uuidv4();
    const now = new Date().toISOString();

    // Create and add optimistic message
    const optimisticMessage: ChatMessage = {
      fromNumber: fromNumber,
      toNumber: toNumber,
      text: trimmedText,
      createdAt: now,
      status: MessageStatusEnum.PENDING,
      isOptimistic: true,
      tempId: tempId,
    };

    dispatch(chatSlice[CHAT_ADD_OPTIMISTIC_MESSAGE](optimisticMessage));

    // Send message via socket
    const socket = getClientSocket();
    if (socket) {
      socket.emit(ConversationEventEnum.SEND_MESSAGE, {
        fromNumber: fromNumber,
        toNumber: toNumber,
        textMessage: trimmedText,
        tempId: tempId,
      });
    }
  };

  const handleRetryMessage = (tempId: string) => {
    // Find the failed message by tempId
    const failedMessage = messages.find((msg) => msg.tempId === tempId && msg.status === MessageStatusEnum.ERROR);

    if (!failedMessage) return;

    // Update the message status back to PENDING
    dispatch(
      chatSlice[CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS]({
        tempId: tempId,
        status: MessageStatusEnum.PENDING,
      })
    );

    // Resend the message via socket
    const socket = getClientSocket();
    if (socket) {
      socket.emit(ConversationEventEnum.SEND_MESSAGE, {
        fromNumber: failedMessage.fromNumber,
        toNumber: failedMessage.toNumber,
        textMessage: failedMessage.text,
        tempId: tempId,
      });
    }
  };

  const handleChatSelect = (contactPhoneNumber: string) => {
    if (phoneNumber) {
      navigate(`/instance/${phoneNumber}/${contactPhoneNumber}`);
    }
  };

  const handleSearch = useCallback(
    (value: string) => {
      if (phoneNumber && value !== lastSearchValueRef.current) {
        lastSearchValueRef.current = value;
        dispatch(chatSlice[CHAT_RESET_PAGINATION]());
        dispatch(chatSlice[CHAT_CLEAR_SEARCH_DATA]());
        dispatch(chatSlice[CHAT_SEARCH_CONVERSATIONS]({ phoneNumber, searchValue: value }));
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
          <div className="text-gray-600">{t('VALIDATE.PHONE_NUMBER_REQUIRED')}</div>
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
        messages={messages}
        disabled={!isInstanceConnected}
        loading={chatLoading}
        error={error}
        phoneNumber={phoneNumber}
        withPhoneNumber={withPhoneNumber}
        headerComponent={selectedContact ? <ChatHeader contact={selectedContact} /> : undefined}
        onSendMessage={handleSendMessage}
        onRetry={handleRetryMessage}
      />
    </div>
  );
};

export default InstanceChat;
