import type { Options } from '@models';
import { ChatDepartmentEnum, ChatIntentEnum } from '@client/pages/Chat/store/chat.enum';

export const MAX_CHAT_CONVERSATIONS = 100;
export const MAX_CHAT_MESSAGES = 100;

export const INTENT_OPTIONS: Options<string> = [ChatIntentEnum.NEUTRAL, ChatIntentEnum.DECLINE, ChatIntentEnum.UNSUBSCRIBE].map((intent) => ({
  title: `CHAT.INTENT.${intent}`,
  value: intent,
}));

export const DEPARTMENT_OPTIONS: Options<string> = Object.values(ChatDepartmentEnum).map((department) => ({
  title: `CHAT.DEPARTMENT.${department}`,
  value: department,
}));

export const INTERESTED_OPTIONS: Options<boolean> = [{ title: 'GENERAL.INTERESTED', value: true }];
