// src/server/services/token/token.type.ts
import { AuthUser } from '@server/api/auth/auth.type';

export type AccessToken = Record<string, unknown> & Pick<AuthUser, 'firstName' | 'lastName' | 'hashPassword' | 'email'>;
