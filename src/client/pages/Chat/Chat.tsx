import React, { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { cn } from '@client/plugins';
import { StoreEnum } from '@client/store/store.enum';
import type { RootState, AppDispatch } from '@client/store';
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
} from './store/chat.constants';
import { ChatLeftPanel, ChatRightPanel } from './components';
import ChatListItem from './components/ChatListItem';
import type { GlobalChatContact, ChatMessage } from './store/chat.types';

type ChatProps = {
  className?: string;
};

const Chat: React.FC<ChatProps> = ({ className }) => {
  const { instanceNumber, phoneNumber } = useParams<{ instanceNumber?: string; phoneNumber?: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

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
    dispatch(globalChatSlice.resetPagination());
    dispatch(globalChatSlice[CHAT_SEARCH_ALL_CONVERSATIONS]({}));
  }, [dispatch]);

  // Find selected contact based on URL parameters
  const selectedContactFromUrl =
    conversations?.find((contact) => contact.instanceNumber === instanceNumber && contact.phoneNumber === phoneNumber) || null;

  // Set selected contact if URL parameters match
  useEffect(() => {
    if (selectedContactFromUrl && selectedContact !== selectedContactFromUrl) {
      dispatch(globalChatSlice.setSelectedContact(selectedContactFromUrl));
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
      dispatch(globalChatSlice.addIncomingMessage(messageData));
    };

    const handleNewConversation = (conversationData: GlobalChatContact) => {
      // Add new conversation to the list
      dispatch(globalChatSlice.addNewConversation(conversationData));
    };

    socket?.on(ConversationEventEnum.NEW_MESSAGE, handleNewMessage);
    socket?.on(ConversationEventEnum.NEW_CONVERSATION, handleNewConversation);

    return () => {
      socket?.off(ConversationEventEnum.NEW_MESSAGE, handleNewMessage);
      socket?.off(ConversationEventEnum.NEW_CONVERSATION, handleNewConversation);
    };
  }, [dispatch]);

  const handleSendMessage = async (instanceNumber: string, phoneNumber: string, text: string) => {
    if (!text.trim()) return;

    await globalChatSlice.sendMessage({
      fromNumber: instanceNumber,
      toNumber: phoneNumber,
      textMessage: text.trim(),
    });

    // Refetch messages after sending
    dispatch(globalChatSlice[CHAT_GET_CONVERSATION]({ phoneNumber: instanceNumber, withPhoneNumber: phoneNumber }));
  };

  const handleChatSelect = (contact: GlobalChatContact) => {
    navigate(`/chat/${contact.instanceNumber}/${contact.phoneNumber}`);
  };

  const handleSearch = useCallback(
    (value: string) => {
      // Only search if the value actually changed
      if (value !== searchValue) {
        // Reset pagination only if search value actually changed
        dispatch(globalChatSlice.resetPagination());

        // Clear current data and search with new value
        dispatch(globalChatSlice.clearSearchData());
        dispatch(globalChatSlice[CHAT_SEARCH_ALL_CONVERSATIONS]({ searchValue: value }));
      }
    },
    [searchValue, dispatch]
  );

  return (
    <div className={cn('flex h-[calc(100vh-4rem)] bg-gray-100', className)}>
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
