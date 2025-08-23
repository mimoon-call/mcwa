// src/server/server-express.ts
import express, { type Express, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { SocketService } from '@server/services/socket/socket.service';
import { AccessToken } from '@server/services/token/token.type';
import { CookieEnum } from '@server/constants';
import { signatureMiddleware } from '@server/middleware/signature-middleware';
import { HttpServer } from 'vite';
import dir from '../../../dir';
import { BaseResponse } from '@server/models/base-response';

const __public = process.env.NODE_ENV === 'production' ? '/app/public/' : path.join(dir, '/../public/');

type Config = Partial<{
  routes: Array<[`/${string}`, ReturnType<typeof express.Router>]>;
  routePrefix: `/${string}`;
}>;

export class ServerExpress {
  public readonly socket: SocketService<AccessToken>;
  private readonly app: Express;
  public readonly server: HttpServer;

  // Declare them but don’t assign yet
  public get!: Express['get'];
  public post!: Express['post'];
  public use!: Express['use'];
  public put!: Express['put'];
  public delete!: Express['delete'];

  constructor(config: Config) {
    const { routes = [], routePrefix = '' } = config;

    this.app = express();
    this.server = createServer(this.app);
    this.get = this.app.get.bind(this.app);
    this.post = this.app.post.bind(this.app);
    this.use = this.app.use.bind(this.app);
    this.put = this.app.put.bind(this.app);
    this.delete = this.app.delete.bind(this.app);

    console.log('Client Origin:', process.env.CLIENT_ORIGIN);

    this.socket = new SocketService<AccessToken>('id', this.server, {
      secretKey: process.env.ACCESS_TOKEN_KEY!,
      cookieKey: CookieEnum.ACCESS_TOKEN,
      origin: process.env.CLIENT_ORIGIN,
    });

    this.app.use(cors({ origin: '*', credentials: true }));
    this.app.use(cookieParser());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Ensure service worker is served with correct MIME type FIRST
    this.app.get('/sw.js', (req: Request, res: Response) => {
      try {
        res.setHeader('Content-Type', 'application/javascript');
        res.sendFile(__public + 'sw.js');
      } catch (error) {
        console.error('Error serving service worker:', error);
        res.status(500).send('Service Worker Error');
      }
    });

    this.app.get('/favicon.ico', (req: Request, res: Response) => {
      try {
        res.setHeader('Content-Type', 'image/x-icon');
        res.sendFile(__public + 'favicon.ico');
      } catch (_error) {
        res.status(404);
      }
    });

    // Serve static files from dist/client in production FIRST (before other routes)
    if (process.env.NODE_ENV === 'production') {
      const clientPath = path.join(dir, '/../client');
      this.app.use(
        '/client',
        express.static(clientPath, {
          setHeaders: (res, path) => {
            if (path.endsWith('.js')) {
              res.setHeader('Content-Type', 'application/javascript');
            } else if (path.endsWith('.css')) {
              res.setHeader('Content-Type', 'text/css');
            }
          },
        })
      );
    }

    // Serve static files from public directory
    this.app.use(express.static(path.join(dir, '/../public')));

    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || 'unknown',
      });
    });

    // Add a simple health check endpoint (not root to avoid overriding SSR)
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.status(200).json({
        message: 'React SSR Server is running',
        status: 'healthy',
        timestamp: new Date().toISOString(),
      });
    });

    // Add error handling middleware
    this.app.use((err: Error, req: Request, res: Response, _next: () => void) => {
      console.error('Error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      });
    });

    routes.forEach(([routePath = '', router]) => {
      this.app.use([routePrefix, routePath].join(''), router);
    });

    this.app.post(
      '/webhook/:userId',
      signatureMiddleware(process.env.WEBHOOK_SECRET!),
      (req: Request<{ userId: string }, never, Record<string, unknown>, { event: string }>, res: Response<BaseResponse>) => {
        const isSent = this.socket.send(req.params.userId, req.query.event, req.body);
        res.status(200).send({ returnCode: isSent ? 0 : 1 });
      }
    );
  }

  listen(port?: number) {
    const listenPort = port ?? 3000;
    this.server.listen(listenPort, () => {
      console.log(`🚀 Server listening on http://localhost:${listenPort}`);
    });
  }
}
