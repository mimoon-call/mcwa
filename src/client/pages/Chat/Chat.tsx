import type { RootState, AppDispatch } from '@client/store';
import type { GlobalChatContact, ChatMessage } from './store/chat.types';
import React, { useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { cn } from '@client/plugins';
import { StoreEnum } from '@client/store/store.enum';
import globalChatSlice from './store/chat.slice';
import getClientSocket from '@helpers/get-client-socket.helper';
import { ConversationEventEnum } from './store/chat-event.enum';
import {
  CHAT_SEARCH_ALL_CONVERSATIONS,
  CHAT_GET_CONVERSATION,
  CHAT_SEARCH_DATA,
  CHAT_SEARCH_VALUE,
  CHAT_MESSAGES_DATA,
  CHAT_MESSAGES_PAGINATION,
  CHAT_LOADING,
  SEARCH_LOADING,
  CHAT_ERROR,
  CHAT_SELECTED_CONTACT,
  CHAT_UPDATE_MESSAGE_STATUS,
  CHAT_ADD_INCOMING_MESSAGE,
  CHAT_ADD_NEW_CONVERSATION,
  CHAT_RESET_PAGINATION,
  CHAT_SET_SELECTED_CONTACT,
  CHAT_SEND_MESSAGE,
  CHAT_CLEAR_SEARCH_DATA,
  CHAT_DELETE_CONVERSATION,
  CHAT_REMOVE_CONVERSATION,
} from './store/chat.constants';
import { ChatLeftPanel, ChatRightPanel } from './components';
import ChatListItem from './components/ChatListItem';
import { openDeletePopup } from '@helpers/open-delete-popup';
import type { MenuItem } from '@components/Menu/Menu.type';

type ChatProps = {
  className?: string;
};

const Chat: React.FC<ChatProps> = ({ className }) => {
  const { instanceNumber, phoneNumber } = useParams<{ instanceNumber?: string; phoneNumber?: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const lastSearchValueRef = useRef<string>('');

  // Get data from store
  const conversations = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_SEARCH_DATA]) || [];
  const searchValue = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_SEARCH_VALUE]);
  const messages = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_MESSAGES_DATA]) || [];
  const messagesPagination = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_MESSAGES_PAGINATION]);
  const chatLoading = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_LOADING]);
  const searchLoading = useSelector((state: RootState) => state[StoreEnum.globalChat][SEARCH_LOADING]);
  const error = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_ERROR]) !== null;
  const selectedContact = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_SELECTED_CONTACT]);

  // Load conversations on component mount
  useEffect(() => {
    dispatch(globalChatSlice[CHAT_RESET_PAGINATION]());
    dispatch(globalChatSlice[CHAT_SEARCH_ALL_CONVERSATIONS]({}));
    // Initialize the ref with the current search value
    lastSearchValueRef.current = searchValue;
  }, [dispatch]);

  // Find selected contact based on URL parameters
  const selectedContactFromUrl =
    conversations?.find((contact) => contact.instanceNumber === instanceNumber && contact.phoneNumber === phoneNumber) || null;

  // Set selected contact if URL parameters match
  useEffect(() => {
    if (selectedContactFromUrl && selectedContact !== selectedContactFromUrl) {
      dispatch(globalChatSlice[CHAT_SET_SELECTED_CONTACT](selectedContactFromUrl));
    }
  }, [selectedContactFromUrl, selectedContact, dispatch]);

  // Load messages when a chat is selected
  useEffect(() => {
    if (selectedContact) {
      dispatch(
        globalChatSlice[CHAT_GET_CONVERSATION]({
          phoneNumber: selectedContact.instanceNumber,
          withPhoneNumber: selectedContact.phoneNumber,
        })
      );
    }
  }, [selectedContact, dispatch]);

  // Listen for new message events
  useEffect(() => {
    const socket = getClientSocket();

    const handleNewMessage = (messageData: ChatMessage) => {
      // The Redux slice will handle checking if it's the active chat and deduplication
      dispatch(globalChatSlice[CHAT_ADD_INCOMING_MESSAGE](messageData));
    };

    const handleNewConversation = (conversationData: GlobalChatContact) => {
      // Add new conversation to the list
      dispatch(globalChatSlice[CHAT_ADD_NEW_CONVERSATION](conversationData));
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
      dispatch(globalChatSlice[CHAT_UPDATE_MESSAGE_STATUS](statusData));
    };

    socket?.on(ConversationEventEnum.NEW_MESSAGE, handleNewMessage);
    socket?.on(ConversationEventEnum.NEW_CONVERSATION, handleNewConversation);
    socket?.on(ConversationEventEnum.MESSAGE_STATUS_UPDATE, handleMessageStatusUpdate);

    return () => {
      socket?.off(ConversationEventEnum.NEW_MESSAGE, handleNewMessage);
      socket?.off(ConversationEventEnum.NEW_CONVERSATION, handleNewConversation);
      socket?.off(ConversationEventEnum.MESSAGE_STATUS_UPDATE, handleMessageStatusUpdate);
    };
  }, [dispatch]);

  const handleSendMessage = async (instanceNumber: string, phoneNumber: string, text: string) => {
    if (!text.trim()) return;

    await globalChatSlice[CHAT_SEND_MESSAGE]({
      fromNumber: instanceNumber,
      toNumber: phoneNumber,
      textMessage: text.trim(),
    });
  };

  const handleChatSelect = (contact: GlobalChatContact) => {
    navigate(`/chat/${contact.instanceNumber}/${contact.phoneNumber}`);
  };

  const handleSearch = useCallback(
    (value: string) => {
      // Only search if the value actually changed from the last search
      if (value !== lastSearchValueRef.current) {
        // Update the ref to track the last searched value
        lastSearchValueRef.current = value;

        // Reset pagination only if search value actually changed
        dispatch(globalChatSlice[CHAT_RESET_PAGINATION]());

        // Clear current data and search with new value
        dispatch(globalChatSlice[CHAT_CLEAR_SEARCH_DATA]());
        dispatch(globalChatSlice[CHAT_SEARCH_ALL_CONVERSATIONS]({ searchValue: value }));
      }
    },
    [dispatch]
  );

  const handleDeleteConversation = async () => {
    if (!selectedContact?.phoneNumber || !selectedContact.instanceNumber) return;

    await openDeletePopup({
      title: 'CHAT.DELETE_CONVERSATION',
      description: 'CHAT.DELETE_CONVERSATION_WARNING',
      callback: async () => {
        await globalChatSlice[CHAT_DELETE_CONVERSATION]({
          fromNumber: selectedContact.instanceNumber,
          toNumber: selectedContact.phoneNumber,
        });

        // Remove conversation from state
        dispatch(
          globalChatSlice[CHAT_REMOVE_CONVERSATION]({
            fromNumber: selectedContact.instanceNumber,
            toNumber: selectedContact.phoneNumber,
          })
        );

        // Clear selected contact and navigate to chat without params
        dispatch(globalChatSlice[CHAT_SET_SELECTED_CONTACT](null));
        navigate('/chat', { replace: true });
      },
      successMessage: 'CHAT.CONVERSATION_DELETED_SUCCESSFULLY',
    });
  };

  const actions: MenuItem[] = [
    {
      label: 'GENERAL.DELETE',
      iconName: 'svg:trash',
      className: 'text-red-800',
      onClick: handleDeleteConversation,
    },
  ];

  return (
    <div className={cn('flex h-full bg-gray-100', className)}>
      <ChatLeftPanel
        items={conversations}
        selectedItem={selectedContact}
        loading={searchLoading}
        error={error}
        searchValue={searchValue}
        onItemSelect={handleChatSelect}
        onSearch={handleSearch}
        itemComponent={(contact, isSelected, onClick) => (
          <ChatListItem contact={contact as GlobalChatContact} isSelected={isSelected} onClick={(contact) => onClick(contact as GlobalChatContact)} />
        )}
        getItemKey={(contact) => `${contact.instanceNumber}-${contact.phoneNumber}`}
        isItemSelected={(contact, selectedContact) =>
          selectedContact?.instanceNumber === contact.instanceNumber && selectedContact?.phoneNumber === contact.phoneNumber
        }
      />
      <ChatRightPanel
        menuItems={actions}
        selectedContact={selectedContact}
        messages={messages}
        disabled={false}
        loading={chatLoading}
        error={error}
        phoneNumber={selectedContact?.instanceNumber}
        withPhoneNumber={selectedContact?.phoneNumber}
        hasMore={messagesPagination?.hasMore || false}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
};

export default Chat;
