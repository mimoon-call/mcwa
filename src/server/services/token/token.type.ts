// src/server/services/token/token.type.ts
import type { BaseId } from '@server/models/base-id';
import { RoleEnum } from '@server/constants';

export interface AccessToken extends Record<string, unknown> {
  id: BaseId;
  email: string;
  hashedPass: string;
  firstName?: string;
  lastName?: string;
  role?: keyof typeof RoleEnum;
}
