import type { WAMessageIncomingCallback, WAMessageIncomingRaw } from '@server/services/whatsapp/whatsapp-instance.type';
import getLocalTime from '@server/helpers/get-local-time';
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { conversationAiHandler } from '@server/api/message-queue/helpers/conversation-ai.handler';
import logger from '@server/helpers/logger';
import { app } from '@server/index';
import { ConversationEventEnum } from '@server/api/conversation/conversation-event.enum';

const speechToText = async (raw: WAMessageIncomingRaw) => {
  // Check if raw message contains audio and has buffer
  if (raw.mediaType === 'audio' || raw.mediaType === 'ptt') {
    if (raw.buffer && raw.mimeType) {
      try {
        const openAiService = new OpenAiService({
          failureCallback: (errorMessage) => app.socket.broadcast(ConversationEventEnum.AI_FAILURE, { errorMessage }),
          throwErrorFlag: true,
        });

        const transcribedText = await openAiService.speechToText(raw.buffer, raw.mimeType, {
          model: 'gpt-4o-mini-transcribe',
          language: 'he', // Force Hebrew output regardless of input language
        });

        if (transcribedText) {
          logger.debug(getLocalTime(), `[${raw.key?.id}]`, `[${raw.key?.remoteJid}]`, `Audio transcribed:`, transcribedText);
          return transcribedText;
        }
      } catch (error) {
        logger.error(getLocalTime(), `[${raw.key?.id}]`, `[${raw.key?.remoteJid}]`, `Audio transcription failed:`, error);
      }
    } else {
      logger.debug(getLocalTime(), `[${raw.key?.id}]`, `[${raw.key?.remoteJid}]`, `Audio message without buffer or mimeType`);
    }
  }

  return null;
};

export const incomingMessageHandler: WAMessageIncomingCallback = async (msg, raw, messageId) => {
  // Internal message
  if (msg.internalFlag) {
    logger.debug(getLocalTime(), `[${msg.fromNumber}:${msg.toNumber}]`, msg.text);

    return;
  }

  if (msg.fromNumber.includes('@')) {
    logger.debug(getLocalTime(), `[${msg.fromNumber}]`, '[NON-PM]', msg.text);

    return;
  }

  const speechText = await speechToText(raw);

  // Update message text with transcribed audio if available
  const messageData = {
    ...msg,
    text: msg.text || speechText, // Use original text if available, otherwise use transcribed text
    raw,
    messageId,
    status: MessageStatusEnum.RECEIVED,
    createdAt: getLocalTime(),
  };

  const { _id } = await WhatsAppMessage.insertOne(messageData);

  if (!messageData.text) return;

  await conversationAiHandler(_id);
};
