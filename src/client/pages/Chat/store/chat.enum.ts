// src/client/pages/Chat/store/chat.enum.ts
export enum MessageStatusEnum {
  RECEIVED = 'RECEIVED',
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  PLAYED = 'PLAYED',
  ERROR = 'ERROR',
}

export enum ChatIntentEnum {
  POSITIVE_INTEREST = 'POSITIVE_INTEREST',
  REQUEST_INFO = 'REQUEST_INFO',
  NEUTRAL = 'NEUTRAL',
  NOT_NOW = 'NOT_NOW',
  DECLINE = 'DECLINE',
  UNSUBSCRIBE = 'UNSUBSCRIBE',
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
  AMBIGUOUS = 'AMBIGUOUS',
  ABUSIVE = 'ABUSIVE',
}

export enum ChatActionEnum {
  REPLY = 'REPLY',
  ASK_CLARIFY = 'ASK_CLARIFY',
  DO_NOT_CONTACT = 'DO_NOT_CONTACT',
  ADD_TO_DNC = 'ADD_TO_DNC',
  SCHEDULE_FOLLOW_UP = 'SCHEDULE_FOLLOW_UP',
}

export enum ChatDepartmentEnum {
  CAR = 'CAR',
  MORTGAGE = 'MORTGAGE',
  GENERAL = 'GENERAL',
}

export enum MessageHandlerActionEnum {
  UPDATE = 'update',
  REPLACE = 'replace',
  ADD = 'add',
}
