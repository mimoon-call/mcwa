import type { Options } from '@models';
import { ChatDepartmentEnum } from '@client/pages/Chat/store/chat.enum';

export const MAX_CHAT_CONVERSATIONS = 50;
export const MAX_CHAT_MESSAGES = 100;

export const DEPARTMENT_OPTIONS: Options<string> = Object.values(ChatDepartmentEnum).map((department) => ({
  title: `CHAT.DEPARTMENT.${department}`,
  value: department,
}));

export const INTERESTED_OPTIONS: Options<boolean> = [{ title: 'GENERAL.INTERESTED', value: true }];
