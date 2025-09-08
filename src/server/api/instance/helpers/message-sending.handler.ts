import type { IMessageKey, WAAppAuth, WASendingMessageCallback } from '@server/services/whatsapp/whatsapp-instance.type';
import type { WAPersona } from '@server/services/whatsapp/whatsapp.type';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';

export const messageSendingHandler: WASendingMessageCallback<WAAppAuth<WAPersona>> = async (instance, toNumber) => {
  const messageKeys = await WhatsAppMessage.aggregate<IMessageKey>([
    { $match: { fromNumber: toNumber, status: MessageStatusEnum.RECEIVED } },
    { $replaceRoot: { newRoot: '$raw.key' } },
  ]);

  for (const key of messageKeys) {
    await instance.read(key);
  }

  await WhatsAppMessage.updateMany({ fromNumber: toNumber, status: MessageStatusEnum.RECEIVED }, { $set: { status: MessageStatusEnum.READ } });
};
