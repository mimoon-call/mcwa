// src/server/index.ts
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ServerExpress } from '@server/services/server-express/server-express';
import authRoute from '@server/api/auth/auth.route';
import { MongoService } from '@server/services/database/mongo.service';
import { WhatsappWarmService } from '@server/services/whatsapp/whatsapp-warm.service';
import { whatsappConfig } from '@server/services/whatsapp/whatsapp-config';
import getLocalNow from '@server/helpers/get-local-now';
import { WhatsAppMessage } from '@server/services/whatsapp/whatsapp.db';
import { routeMiddleware } from '@server/middleware/route-wrapper.middleware';
import createViteSSR from '@server/create-vite-ssr';
import instanceRoute from '@server/api/instance/instance.route';
import { InstanceEventEnum } from '@server/api/instance/instance-event.enum';

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
  ],
});

export const wa = new WhatsappWarmService({
  ...whatsappConfig,
  debugMode: true,
  onIncomingMessage: (msg, raw) => {
    const now = getLocalNow();
    WhatsAppMessage.insertOne({ ...msg, raw, createdAt: now });
  },
  onOutgoingMessage: (msg, raw) => {
    const now = getLocalNow();
    WhatsAppMessage.insertOne({ ...msg, raw, createdAt: now });
  },
});

(async () => {
  await MongoService.connect();

  wa.onConversationEnd((data) => {
    app.socket.broadcast(InstanceEventEnum.WARM_END, data);
  });

  wa.onReady(() => {
    wa.startWarmingUp();
  });

  wa.onUpdate((state) => {
    app.socket.broadcast(InstanceEventEnum.INSTANCE_UPDATE, state);
  });

  // app.get('/qr/:number', async (req, res) => {
  //   const number = req.params.number;
  //
  //   try {
  //     const qrBase64 = await wa.addInstanceQR(number); // data:image/png;base64,...
  //
  //     res.send(`
  //         <!DOCTYPE html>
  //         <html lang="en">
  //         <head>
  //           <meta charset="UTF-8" />
  //           <title>Scan WhatsApp QR: ${number}</title>
  //           <style>
  //             body { font-family: sans-serif; text-align: center; margin-top: 40px; }
  //             img { width: 300px; height: 300px; }
  //           </style>
  //         </head>
  //         <body>
  //           <h1>Scan QR Code for <code>${number}</code></h1>
  //           <img src="${qrBase64}" alt="WhatsApp QR for ${number}" />
  //           <p>Open WhatsApp → Menu → Linked Devices → Link a Device</p>
  //         </body>
  //         </html>
  //       `);
  //   } catch (err: any) {
  //     res.status(500).send(`
  //         <h1>❌ Error generating QR for ${number}</h1>
  //         <p>${err.message}</p>
  //       `);
  //   }
  // });

  app.get('/*', routeMiddleware(), await createViteSSR(app, isProduction));

  app.listen(port);
})();
