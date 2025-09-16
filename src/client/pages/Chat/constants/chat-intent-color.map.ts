import { ChatIntentEnum } from '@client/pages/Chat/store/chat.enum';

export const ChatIntentColorMap = new Map<ChatIntentEnum, string>()
  .set(ChatIntentEnum.POSITIVE_INTEREST, 'text-green-600')
  .set(ChatIntentEnum.REQUEST_INFO, 'text-blue-600')
  .set(ChatIntentEnum.NEUTRAL, 'text-gray-600')
  .set(ChatIntentEnum.NOT_NOW, 'text-yellow-600')
  .set(ChatIntentEnum.DECLINE, 'text-orange-600')
  .set(ChatIntentEnum.OUT_OF_SCOPE, 'text-purple-600')
  .set(ChatIntentEnum.AMBIGUOUS, 'text-pink-600')
  .set(ChatIntentEnum.ABUSIVE, 'text-red-600')
  .set(ChatIntentEnum.UNSUBSCRIBE, 'text-red-700');
