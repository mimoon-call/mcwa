// src/server/services/token/token.service.ts
import jwt, { type SignOptions, type Secret } from 'jsonwebtoken';

type ExpiresIn = `${number}h` | `${number}m` | `${number}d`;

export default class TokenService {
  public static encrypt<T>(payload: T, options?: SignOptions & { secretKey?: Secret; expiresIn?: ExpiresIn }): string {
    const { secretKey = process.env.ACCESS_TOKEN_KEY!, ...restOptions } = options || {};

    return jwt.sign(payload as string | object | Buffer, secretKey, { expiresIn: options?.expiresIn || '30d', ...restOptions });
  }

  public static decrypt<T>(token?: string | null, secretKey: Secret = process.env.ACCESS_TOKEN_KEY!): T | undefined {
    if (!token) {
      return undefined;
    }

    try {
      const validatedToken: T = jwt.verify(token, secretKey) as T;

      return validatedToken || undefined;
    } catch (_error: unknown) {
      return undefined;
    }
  }
}
