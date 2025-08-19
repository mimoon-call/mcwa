import type { CookieOptions } from 'express';

const _isProd = process.env.NODE_ENV === 'production';

export const COOKIE_OPTIONS: CookieOptions = {
  maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
  sameSite: _isProd ? 'none' : undefined,
  secure: _isProd ? true : undefined,
};
