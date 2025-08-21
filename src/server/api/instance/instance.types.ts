import type { WAAppAuth, WAMessage } from '@server/services/whatsapp/whatsapp-instance.type';
import type { WAPersona } from '@server/services/whatsapp/whatsapp.type';
import type { Pagination, EntityList } from '../../../client/shared/models';

export type InstanceItem = Pick<
  WAAppAuth<WAPersona>,
  'phoneNumber' | 'isActive' | 'warmUpDay' | 'dailyWarmUpCount' | 'dailyWarmConversationCount' | 'hasWarmedUp'
>;

export type SearchInstanceReq = { page: Pagination };
export type SearchInstanceRes = EntityList<InstanceItem>;

export type InstanceConversationItem = { phoneNumber: string; name: string | null; lastMessage: string; lastMessageAt: string };
export type GetInstanceConversationsReq = { page: Pagination };
export type GetInstanceConversationsRes = EntityList<InstanceConversationItem>;

export type InstanceConversation = Pick<WAMessage, 'fromNumber' | 'toNumber' | 'text'> & { createdAt: Date };
export type GetInstanceConversationReq = { withPhoneNumber: string; page: Pagination };
export type GetInstanceConversationRes = EntityList<InstanceConversation>;

export type AddInstanceRes = { image: string };
