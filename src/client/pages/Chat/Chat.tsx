import type { RootState, AppDispatch } from '@client/store';
import type { GlobalChatContact, ChatMessage } from './store/chat.types';
import { MessageStatusEnum } from './store/chat.enum';
import React, { useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import { cn } from '@client/plugins';
import { v4 as uuidv4 } from 'uuid';
import { StoreEnum } from '@client/store/store.enum';
import { chatSlice } from './store/chat.slice';
import getClientSocket from '@helpers/get-client-socket.helper';
import { joinConversationRoom, leaveConversationRoom } from '@helpers/room.helper';
import { ConversationEventEnum } from './store/chat-event.enum';
import {
  CHAT_ADD_INCOMING_MESSAGE,
  CHAT_ADD_NEW_CONVERSATION,
  CHAT_RESET_PAGINATION,
  CHAT_SEARCH_ALL_CONVERSATIONS,
  CHAT_GET_CONVERSATION,
  CHAT_DELETE_CONVERSATION,
  CHAT_SET_SELECTED_CONTACT,
  CHAT_UPDATE_MESSAGE_STATUS,
  CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS,
  CHAT_ADD_OPTIMISTIC_MESSAGE,
  CHAT_REMOVE_CONVERSATION,
  CHAT_CLEAR_SEARCH_DATA,
  CHAT_SEARCH_DATA,
  CHAT_SEARCH_VALUE,
  CHAT_MESSAGES_DATA,
  CHAT_LOADING,
  SEARCH_LOADING,
  CHAT_ERROR,
  GLOBAL_SELECTED_CONTACT,
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

  // Get all chat actions using constants
  const {
    [CHAT_SEARCH_ALL_CONVERSATIONS]: searchConversations,
    [CHAT_GET_CONVERSATION]: getConversation,
    [CHAT_DELETE_CONVERSATION]: deleteConversation,
    [CHAT_ADD_INCOMING_MESSAGE]: addIncomingMessage,
    [CHAT_ADD_NEW_CONVERSATION]: addNewConversation,
    [CHAT_RESET_PAGINATION]: resetPagination,
    [CHAT_SET_SELECTED_CONTACT]: setSelectedContact,
    [CHAT_UPDATE_MESSAGE_STATUS]: updateMessageStatus,
    [CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS]: updateOptimisticMessageStatus,
    [CHAT_ADD_OPTIMISTIC_MESSAGE]: addOptimisticMessage,
    [CHAT_REMOVE_CONVERSATION]: removeConversation,
    [CHAT_CLEAR_SEARCH_DATA]: clearSearchData,
  } = chatSlice;

  // Get data from store using constants
  const conversations = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_SEARCH_DATA]) || [];
  const searchValue = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_SEARCH_VALUE]);
  const messages = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_MESSAGES_DATA]) || [];
  const chatLoading = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_LOADING]);
  const searchLoading = useSelector((state: RootState) => state[StoreEnum.globalChat][SEARCH_LOADING]);
  const error = useSelector((state: RootState) => state[StoreEnum.globalChat][CHAT_ERROR]) !== null;
  const selectedContact = useSelector((state: RootState) => state[StoreEnum.globalChat][GLOBAL_SELECTED_CONTACT]);

  // Get active instances from global store
  const activeList = useSelector((state: RootState) => state[StoreEnum.global].activeList);

  // Load conversations on component mount
  useEffect(() => {
    dispatch(resetPagination());
    dispatch(searchConversations({}));
    // Initialize the ref with the current search value
    lastSearchValueRef.current = searchValue;
  }, [dispatch]);

  // Find selected contact based on URL parameters
  const selectedContactFromUrl =
    (conversations as GlobalChatContact[])?.find((contact) => contact.instanceNumber === instanceNumber && contact.phoneNumber === phoneNumber) ||
    null;

  // Set selected contact if URL parameters match
  useEffect(() => {
    if (selectedContactFromUrl && selectedContact !== selectedContactFromUrl) {
      dispatch(setSelectedContact(selectedContactFromUrl));
    }
  }, [selectedContactFromUrl, selectedContact, dispatch]);

  // Load messages when a chat is selected and join conversation room
  useEffect(() => {
    if (selectedContact) {
      // Join the conversation room for live updates
      joinConversationRoom(selectedContact.instanceNumber, selectedContact.phoneNumber);

      dispatch(
        getConversation({
          phoneNumber: selectedContact.instanceNumber,
          withPhoneNumber: selectedContact.phoneNumber,
        })
      );
    }

    // Cleanup: leave conversation room when component unmounts or chat changes
    return () => {
      if (selectedContact) {
        leaveConversationRoom(selectedContact.instanceNumber, selectedContact.phoneNumber);
      }
    };
  }, [selectedContact, dispatch]);

  // Listen for new message events
  useEffect(() => {
    const socket = getClientSocket();

    const handleNewMessage = (messageData: ChatMessage) => {
      dispatch(addIncomingMessage(messageData));
    };

    const handleNewConversation = (conversationData: GlobalChatContact) => {
      dispatch(addNewConversation(conversationData));
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
      dispatch(updateMessageStatus(statusData));
    };

    const handleMessageSent = (response: { success: boolean; tempId: string; returnCode?: number; error?: string }) => {
      if (response.success) {
        dispatch(
          updateOptimisticMessageStatus({
            tempId: response.tempId,
            status: MessageStatusEnum.DELIVERED,
          })
        );
      } else {
        dispatch(
          updateOptimisticMessageStatus({
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
  }, [selectedContact, dispatch]);

  const handleSendMessage = async (instanceNumber: string, phoneNumber: string, text: string) => {
    if (!text.trim()) return;

    const trimmedText = text.trim();
    const tempId = uuidv4();
    const now = new Date().toISOString();

    // Create and add optimistic message
    const optimisticMessage: ChatMessage = {
      fromNumber: instanceNumber,
      toNumber: phoneNumber,
      text: trimmedText,
      createdAt: now,
      status: MessageStatusEnum.PENDING,
      isOptimistic: true,
      tempId: tempId,
    };

    dispatch(addOptimisticMessage(optimisticMessage));

    // Send message via socket
    const socket = getClientSocket();
    if (socket) {
      socket.emit(ConversationEventEnum.SEND_MESSAGE, {
        fromNumber: instanceNumber,
        toNumber: phoneNumber,
        textMessage: trimmedText,
        tempId: tempId,
      });
    }
  };

  const handleRetryMessage = (id: string) => {
    // Find the failed message by tempId
    const failedMessage = messages.find((msg) => (msg.tempId === id || msg.messageId === id) && msg.status === MessageStatusEnum.ERROR);

    if (!failedMessage) return;

    // Update the message status back to PENDING
    dispatch(
      updateOptimisticMessageStatus({
        tempId: id,
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
        messageId: failedMessage.messageId,
        tempId: id,
      });
    }
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
        dispatch(resetPagination());

        // Clear current data and search with new value
        dispatch(clearSearchData());
        dispatch(searchConversations({ searchValue: value }));
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
        await deleteConversation({
          fromNumber: selectedContact.instanceNumber,
          toNumber: selectedContact.phoneNumber,
        });

        // Remove conversation from state
        dispatch(
          removeConversation({
            fromNumber: selectedContact.instanceNumber,
            toNumber: selectedContact.phoneNumber,
          })
        );

        // Clear selected contact and navigate to chat without params
        dispatch(setSelectedContact(null));
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

  // Check if selected contact's instance is connected
  const isInstanceConnected = selectedContact ? activeList.includes(selectedContact.instanceNumber) : false;

  return (
    <div className={cn('flex h-full bg-gray-100', className)}>
      <ChatLeftPanel
        items={conversations as GlobalChatContact[]}
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
        disabled={!isInstanceConnected}
        loading={chatLoading}
        error={error}
        phoneNumber={selectedContact?.instanceNumber}
        withPhoneNumber={selectedContact?.phoneNumber}
        onSendMessage={handleSendMessage}
        onRetry={handleRetryMessage}
      />
    </div>
  );
};

export default Chat;
