// src/server/create-vite-ssr.ts
import { Express, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { renderAppHtml } from './render';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CookieEnum } from '@server/constants';
import { IS_AUTHENTICATED } from '@client/store/auth.constants';
import { StoreEnum } from '@client/store/store.enum';
import * as cheerio from 'cheerio';
import { CheerioAPI } from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildHtml = (indexHtml: string, renderHtml: string, data?: Record<string, unknown> | null): CheerioAPI => {
  const { direction = 'ltr', title, ...state } = data || {};
  const cheerioApi = cheerio.load(indexHtml);

  if (title) {
    cheerioApi('head').append(`<title>${title}</title>`);
  }

  // cheerioApi('head').append(`<link rel="manifest" href="/manifest.json">`);
  cheerioApi('body').attr('dir', direction as string);
  cheerioApi('body').append(`<script id="ssr">window.__SSR_DATA__=${JSON.stringify(state)};document.getElementById('ssr').remove();</script>`);
  cheerioApi('#root').html(renderHtml);

  return cheerioApi;
};

// dev: use Vite's middleware, NO manifest
const ssrDev = async (app: Pick<Express, 'use'>) => {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
    configFile: path.resolve(__dirname, '../../vite.config.dev.ts'),
  });
  app.use(vite.middlewares);

  return async (req: Request, res: Response) => {
    const ssrData = { [StoreEnum.auth]: { [IS_AUTHENTICATED]: !!req[CookieEnum.ACCESS_TOKEN] } };
    const url = req.originalUrl;
    const indexHtml = await fs.promises.readFile('public/index.html', 'utf-8');

    // Skip HTML transformation in development to avoid React plugin issues
    const cheerioApi = buildHtml(indexHtml, renderAppHtml(url, { isAuthenticated: !!req[CookieEnum.ACCESS_TOKEN] }), ssrData);

    res.status(200).type('html').end(cheerioApi.html());
  };
};

// prod: static files + manifest lookup
const ssrProd = async (_app: Pick<Express, 'use'>, isProduction: boolean) => {
  const dist = path.resolve(__dirname, '../client');
  const manifestPath = path.join(dist, '.vite/manifest.json');

  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8')) as {
    [key: string]: { file: string; css?: string[]; isEntry?: boolean };
  };

  // Ensure this matches your rollupOptions.input path from vite.config.ts
  const entryChunk = manifest['src/client/index.tsx'];
  if (!entryChunk) {
    throw new Error('Could not find entry chunk for src/client/index.tsx in manifest.');
  }

  const jsFile = entryChunk.file;
  const cssFiles = entryChunk.css ?? [];

  // Generate CSS and JS tags
  const styleTags = cssFiles.map((href) => `<link rel="stylesheet" href="/client/${href}">`).join('\n');
  const scriptTag = `<script type="module" crossorigin src="/client/${jsFile}"></script>`;

  // Static assets are now served by ServerExpress class

  return async (req: Request, res: Response) => {
    try {
      const ssrData = { [StoreEnum.auth]: { [IS_AUTHENTICATED]: !!req[CookieEnum.ACCESS_TOKEN] } };
      const url = req.originalUrl;

      // Use correct path for production
      const indexPath = isProduction ? path.join(__dirname, '../../public/index.html') : 'public/index.html';

      const indexHtml = await fs.promises.readFile(indexPath, 'utf-8');
      const cheerioApi = buildHtml(indexHtml, renderAppHtml(url, { isAuthenticated: !!req[CookieEnum.ACCESS_TOKEN] }), ssrData);

      // Remove the development script and inject production assets
      cheerioApi('#client-script').remove();
      cheerioApi('head').append(styleTags);
      cheerioApi('body').append(scriptTag);

      const finalHtml = cheerioApi.html();
      return res.status(200).type('html').end(finalHtml);
    } catch (error) {
      console.error(`SSR error for ${req.originalUrl}:`, error);
      res.status(500).send('Internal Server Error');
    }
  };
};

export const createViteSSR = async (app: Pick<Express, 'use'>, isProd = false) => (isProd ? ssrProd(app, isProd) : ssrDev(app));

export default createViteSSR;
