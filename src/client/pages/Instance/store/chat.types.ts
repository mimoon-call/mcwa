// src/client/pages/Instance/store/chat.types.ts
import type { EntityList } from '@models/entity-list';
import type { ChatMessage, GlobalChatContact, ConversationPairItem, SearchAllConversationsReq, GetConversationReq, SendMessageReq } from '../../Chat/store/chat.types';

// Re-export global types for convenience
export type { ConversationPairItem, GetConversationReq, SendMessageReq };

export type ChatContact = Pick<GlobalChatContact, 'phoneNumber' | 'name' | 'lastMessage' | 'lastMessageAt' | 'profilePictureUrl'>;

export type SearchConversationsReq = SearchAllConversationsReq & {
  phoneNumber: string;
};

export type InstanceChat = { isConnected: boolean; statusCode: number | null; errorMessage: string | null; profilePictureUrl: string | null };
export type SearchConversationsRes = EntityList<ChatContact, InstanceChat>;

export type GetConversationRes = EntityList<ChatMessage>;
