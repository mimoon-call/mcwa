// src/client/pages/Chat/store/chat-shared.constants.ts
// Shared constants used by both Chat and Instance chat slices

export const CHAT_GET_CONVERSATION = 'get-conversation';
export const CHAT_SEARCH_DATA = 'searchData';
export const CHAT_SEARCH_PAGINATION = 'searchPagination';
export const CHAT_SEARCH_VALUE = 'searchValue';
export const CHAT_EXTERNAL_FLAG = 'externalFlag';
export const CHAT_MESSAGES_DATA = 'messagesData';
export const CHAT_MESSAGES_PAGINATION = 'messagesPagination';
export const CHAT_LOADING = 'loading';
export const SEARCH_LOADING = 'searchLoading';
export const CHAT_ERROR = 'error';
export const CHAT_SEND_MESSAGE = 'send-chat-message';
export const CHAT_UPDATE_MESSAGE_STATUS = 'update-message-status';
export const CHAT_CLEAR_SEARCH_DATA = 'clear-search-data';
export const CHAT_RESET_PAGINATION = 'reset-pagination';
export const CHAT_ADD_INCOMING_MESSAGE = 'add-incoming-message';
export const CHAT_ADD_NEW_CONVERSATION = 'add-new-conversation';
export const CHAT_ADD_OPTIMISTIC_MESSAGE = 'add-optimistic-message';
export const CHAT_UPDATE_OPTIMISTIC_MESSAGE_STATUS = 'update-optimistic-message-status';
export const CHAT_LOAD_MORE_MESSAGES = 'load-more-messages';
export const CHAT_LOAD_MORE_CONVERSATIONS = 'load-more-conversations';
export const CHAT_SET_SELECTED_CONTACT = 'set-selected-contact';
export const CHAT_DELETE_CONVERSATION = 'delete-conversation';
export const CHAT_REMOVE_CONVERSATION = 'remove-conversation';
export const CHAT_SEARCH_ALL_CONVERSATIONS = 'search-all-conversations';
export const CHAT_SEARCH_CONVERSATIONS = 'search-conversations';
export const CHAT_SET_SELECTED_PHONE_NUMBER = 'set-selected-phone-number';

// Instance-specific action constants
export const INSTANCE_GET_CONVERSATION = 'get-instance-conversation';
export const INSTANCE_LOAD_MORE_MESSAGES = 'load-more-instance-messages';
export const INSTANCE_LOAD_MORE_CONVERSATIONS = 'load-more-instance-conversations';

// Instance-specific property constants (only for properties that remain separate)
export const INSTANCE_SEARCH_METADATA = 'instanceSearchMetadata';
export const INSTANCE_SELECTED_PHONE_NUMBER = 'instanceSelectedPhoneNumber';
export const INSTANCE_LAST_SEARCH_PARAMS = 'instanceLastSearchParams';

// Global-specific property constants (only for properties that remain separate)
export const GLOBAL_SELECTED_CONTACT = 'globalSelectedContact';
export const GLOBAL_LAST_SEARCH_PARAMS = 'globalLastSearchParams';
