import type { WAAppAuth } from '@server/services/whatsapp/whatsapp-instance.type';
import type { WAPersona } from '@server/services/whatsapp/whatsapp.type';
import type { Pagination, EntityList } from '@models';

export type InstanceItem = Pick<
  WAAppAuth<WAPersona>,
  | 'phoneNumber'
  | 'isActive'
  | 'warmUpDay'
  | 'dailyWarmUpCount'
  | 'dailyWarmConversationCount'
  | 'hasWarmedUp'
  | 'profilePictureUrl'
  | 'gender'
  | 'name'
  | 'lastIpAddress'
> & { isWarmingUp: boolean; isConnected: boolean };

export type SearchInstanceReq = Partial<{ phoneNumber: string; statusCode: number; isActive: boolean; hasWarmedUp: boolean; page: Pagination }>;
export type SearchInstanceRes = EntityList<InstanceItem>;

export type AddInstanceRes = { image: string };
