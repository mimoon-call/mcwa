import getLocalTime from '@server/helpers/get-local-time';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { messageReplyHandler } from '@server/api/message-queue/helpers/message-reply.handler';
import type { WAMessageIncomingCallback } from '@server/services/whatsapp/whatsapp-instance.type';

export const incomingMessageHandler: WAMessageIncomingCallback = async (msg, raw, messageId) => {
  // Internal message
  if (msg.internalFlag) {
    console.log(getLocalTime(), `[${msg.fromNumber}:${msg.toNumber}]`, msg.text);

    return;
  }

  const speechText = await (async () => {
    // Check if raw message contains audio and has buffer
    if (raw.mediaType === 'audio' || raw.mediaType === 'ptt') {
      if (raw.buffer && raw.mimeType) {
        try {
          const openAiService = new OpenAiService();
          console.log(getLocalTime(), `[${msg.fromNumber}:${msg.toNumber}] Converting audio to text...`);
          const transcribedText = await openAiService.speechToText(raw.buffer, raw.mimeType, {
            model: 'gpt-4o-mini-transcribe',
            language: 'he', // Force Hebrew output regardless of input language
          });

          if (transcribedText) {
            console.log(getLocalTime(), `[${msg.fromNumber}:${msg.toNumber}] Audio transcribed:`, transcribedText);
            return transcribedText;
          }
        } catch (error) {
          console.error(getLocalTime(), `[${msg.fromNumber}:${msg.toNumber}] Audio transcription failed:`, error);
        }
      } else {
        console.log(getLocalTime(), `[${msg.fromNumber}:${msg.toNumber}] Audio message without buffer or mimeType`);
      }
    }

    return null;
  })();

  // Update message text with transcribed audio if available
  const messageData = {
    ...msg,
    text: msg.text || speechText, // Use transcribed text if available, otherwise use original text
    raw,
    messageId,
    status: MessageStatusEnum.RECEIVED,
    createdAt: getLocalTime(),
  };

  const { _id } = await WhatsAppMessage.insertOne(messageData);
  await messageReplyHandler(_id);
};
