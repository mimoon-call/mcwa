import type { Options } from '@models';
import { LeadDepartmentEnum, LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';

export const MAX_CHAT_CONVERSATIONS = 50;
export const MAX_CHAT_MESSAGES = 100;

export const INTENT_OPTIONS: Options<string> = [LeadIntentEnum.UNSUBSCRIBE, LeadIntentEnum.DECLINE, LeadIntentEnum.OUT_OF_SCOPE].map((intent) => ({
  title: `CHAT.INTENT.${intent}`,
  value: intent,
}));

export const DEPARTMENT_OPTIONS: Options<string> = Object.values(LeadDepartmentEnum).map((department) => ({
  title: `CHAT.DEPARTMENT.${department}`,
  value: department,
}));

export const INTERESTED_OPTIONS: Options<boolean> = [{ title: 'GENERAL.INTERESTED', value: true }];
