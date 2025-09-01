// src/server/index.ts
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ServerExpress } from '@server/services/server-express/server-express';
import authRoute from '@server/api/auth/auth.route';
import { MongoService } from '@server/services/database/mongo.service';
import { WhatsappWarmService } from '@server/services/whatsapp/whatsapp-warm.service';
import { whatsappConfig } from '@server/services/whatsapp/whatsapp-config';
import getLocalTime from '@server/helpers/get-local-time';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import createViteSSR from '@server/create-vite-ssr';
import instanceRoute from '@server/api/instance/instance.route';
import { InstanceEventEnum } from '@server/api/instance/instance-event.enum';
import messageQueueRoute from '@server/api/message-queue/message-queue.route';

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
    ['/queue', messageQueueRoute],
  ],
});

export const wa = new WhatsappWarmService({
  ...whatsappConfig,
  debugMode: true,
  onIncomingMessage: async (msg, raw) => {
    // Internal message
    if (msg.internalFlag) {
      await WhatsAppMessage.insertOne({ ...msg, raw, createdAt: getLocalTime() });

      return;
    }

    // External message
    const { fromNumber, toNumber } = msg;
    const previousMessage = await WhatsAppMessage.findOne(
      {
        $or: [
          { toNumber: fromNumber, fromNumber: toNumber },
          { fromNumber, toNumber },
        ],
      },
      { sort: { createdAt: -1 } }
    );

    if (previousMessage?.text) {
      console.log('previousMessage.text', previousMessage._id, previousMessage.text);
    }

    await WhatsAppMessage.insertOne({ ...msg, raw, createdAt: getLocalTime(), previousId: previousMessage?._id });
  },
  onOutgoingMessage: async (msg, raw, info) => {
    await WhatsAppMessage.insertOne({ ...msg, raw, info, createdAt: getLocalTime() });
  },
});

(async () => {
  await MongoService.connect();

  wa.onSchedule((nextWarmAt) => app.socket.broadcast(InstanceEventEnum.INSTANCE_NEXT_WARM_AT, { nextWarmAt }));
  wa.onConversationEnd((data) => app.socket.broadcast(InstanceEventEnum.INSTANCE_WARM_END, data));
  wa.onConversationStart((data) => app.socket.broadcast(InstanceEventEnum.INSTANCE_WARM_START, data));
  wa.onConversationActive((data) => app.socket.broadcast(InstanceEventEnum.INSTANCE_WARM_ACTIVE, data));
  wa.onRegister((phoneNumber) => app.socket.broadcast(InstanceEventEnum.INSTANCE_REGISTERED, { phoneNumber }));
  wa.onUpdate((state) => app.socket.broadcast(InstanceEventEnum.INSTANCE_UPDATE, state));
  app.socket.onConnected(InstanceEventEnum.INSTANCE_NEXT_WARM_AT, () => ({ nextWarmAt: wa.nextWarmUp }));

  wa.onReady(() => {
    wa.startWarmingUp();
  });

  app.get('/*', routeMiddleware(), await createViteSSR(app, isProduction));

  app.listen(port);
})();
