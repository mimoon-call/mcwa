// src/server/services/token/token.type.ts
import { AuthUser } from '@server/api/auth/auth.type';

export type AccessToken<T extends object = Record<never, never>> = T & { id: string } & Pick<
    AuthUser,
    'firstName' | 'lastName' | 'hashPassword' | 'email'
  >;
