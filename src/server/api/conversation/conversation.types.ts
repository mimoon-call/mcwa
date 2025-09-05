import type { WAMessage } from '@server/services/whatsapp/whatsapp-instance.type';
import type { Pagination, EntityList } from '@models';

export type SearchConversationItem = { phoneNumber: string; name: string | null; lastMessage: string; lastMessageAt: string };
export type SearchConversationReq = { page: Pagination };
export type SearchConversationRes = EntityList<SearchConversationItem>;

export type GetConversationItem = Pick<WAMessage, 'fromNumber' | 'toNumber' | 'text'> & { createdAt: Date };
export type GetConversationReq = { withPhoneNumber: string; page: Pagination };
export type GetConversationRes = EntityList<GetConversationItem>;
