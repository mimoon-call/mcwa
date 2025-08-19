// src/server/services/socket/socket-service.ts
import type { CorsOptions } from 'cors';
import { DefaultEventsMap, Server as SocketIOServer, Socket } from 'socket.io';
import { createServer } from 'http';
import cookie from 'cookie';
import TokenService from '@server/services/token/token.service';
import type { Secret } from 'jsonwebtoken';

type Options = {
  origin?: CorsOptions['origin'];
  cookieKey: string;
  secretKey: Secret;
};

export type SocketManage<Token> = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, { user?: Token }>;

export default class SocketServer<Token> {
  public readonly io: SocketIOServer;

  constructor(server: ReturnType<typeof createServer>, options: Options) {
    const { cookieKey, secretKey } = options;

    this.io = new SocketIOServer(server, { cors: { origin: options.origin || '*', credentials: true } });

    this.io.use((socket: SocketManage<Token>, next) => {
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = cookie.parse(cookieHeader || '');
      const token = cookies[cookieKey];

      socket.data.user = TokenService.decrypt<Token>(token, secretKey);

      next();
    });
  }
}
