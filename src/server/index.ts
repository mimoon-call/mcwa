// src/server/index.ts
import type { WAActiveWarm, WAWarmUpdate } from '@server/services/whatsapp/whatsapp-warm.types';
import type { WAAppAuth } from '@server/services/whatsapp/whatsapp-instance.type';
import type { WAPersona, WAReadyEvent } from '@server/services/whatsapp/whatsapp.type';
import './shared/prototype/array';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ServerExpress } from '@server/services/server-express/server-express';
import authRoute from '@server/api/auth/auth.route';
import instanceRoute from '@server/api/instance/instance.route';
import messageQueueRoute from '@server/api/message-queue/message-queue.route';
import conversationRoute from '@server/api/conversation/conversation.route';
import { MongoService } from '@server/services/database/mongo.service';
import { WhatsappWarmService } from '@server/services/whatsapp/whatsapp-warm.service';
import { whatsappConfig } from '@server/services/whatsapp/whatsapp-config';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import createViteSSR from '@server/create-vite-ssr';
import { InstanceEventEnum } from '@server/api/instance/instance-event.enum';
import { incomingMessageHandler } from '@server/api/instance/helpers/incoming-message.handler';
import { outgoingMessageHandler } from '@server/api/instance/helpers/outgoing-message.handler';
import { updateMessageHandler } from '@server/api/instance/helpers/update-message.handler';
import { messageSendingHandler } from '@server/api/instance/helpers/message-sending.handler';
import { registerConversationSocketHandlers } from '@server/api/conversation/conversation-socket.handlers';
import { getActiveInstanceState } from '@server/api/instance/helpers/get-active-instance-state';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const resolve = (p: string) => path.resolve(__dirname, p);

  dotenv.config({ path: resolve(isProduction ? '../../.env' : '../../.env.development') });
} catch (e) {
  console.error('dotenv:file', e);

  dotenv.config();
}

export const app = new ServerExpress({
  routePrefix: '/api',
  routes: [
    ['/auth', authRoute],
    ['/instance', instanceRoute],
    ['/conversation', conversationRoute],
    ['/queue', messageQueueRoute],
  ],
});

export const wa = new WhatsappWarmService({
  ...whatsappConfig,
  debugMode: isProduction ? ['info', 'error'] : true,
  warmUpOnReady: false,
  onIncomingMessage: incomingMessageHandler,
  onOutgoingMessage: outgoingMessageHandler,
  onMessageUpdate: updateMessageHandler,
  onSendingMessage: messageSendingHandler,
});

(async () => {
  await MongoService.connect();

  wa.onSchedule((nextWarmAt) => app.socket.broadcast<{ nextWarmAt: Date | null }>(InstanceEventEnum.INSTANCE_NEXT_WARM_AT, { nextWarmAt }));
  wa.onConversationEnd((data) => app.socket.broadcast<WAWarmUpdate>(InstanceEventEnum.INSTANCE_WARM_END, data));
  wa.onConversationStart((data) => app.socket.broadcast<WAWarmUpdate>(InstanceEventEnum.INSTANCE_WARM_START, data));
  wa.onConversationActive((data) => app.socket.broadcast<WAActiveWarm>(InstanceEventEnum.INSTANCE_WARM_ACTIVE, data));
  wa.onRegister((phoneNumber) => app.socket.broadcast<{ phoneNumber: string }>(InstanceEventEnum.INSTANCE_REGISTERED, { phoneNumber }));
  wa.onUpdate((state) => app.socket.broadcast<Partial<WAAppAuth<WAPersona>>>(InstanceEventEnum.INSTANCE_UPDATE, state));
  wa.onWarmingStatusChange((isWarming) => app.socket.broadcast<{ isWarming: boolean }>(InstanceEventEnum.INSTANCE_WARMING_STATUS, { isWarming }));
  app.socket.onConnected<{ nextWarmAt: Date | null }>(InstanceEventEnum.INSTANCE_NEXT_WARM_AT, () => ({ nextWarmAt: wa.nextWarmUp }));
  app.socket.onConnected<{ isWarming: boolean }>(InstanceEventEnum.INSTANCE_WARMING_STATUS, () => ({ isWarming: wa.isWarming }));
  app.socket.onConnected<WAReadyEvent>(InstanceEventEnum.INSTANCE_READY, getActiveInstanceState);

  // Register conversation socket handlers
  registerConversationSocketHandlers(app.socket);

  wa.onReady(() => {
    app.socket.broadcast<WAReadyEvent>(InstanceEventEnum.INSTANCE_READY, getActiveInstanceState());
  });

  wa.onDisconnect(() => {
    app.socket.broadcast<WAReadyEvent>(InstanceEventEnum.INSTANCE_READY, getActiveInstanceState());
  });

  app.get('/*', routeMiddleware(), await createViteSSR(app, isProduction));

  app.listen(port);
})();
