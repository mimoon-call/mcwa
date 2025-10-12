import type { BaseResponse } from '@server/models';
import { UserRole } from '@server/api/auth/auth.enum';

export type LoginReq = { email: string; password: string };
export type LoginRes = BaseResponse;

export type LogoutRes = BaseResponse;

export type AuthUser = {
  firstName: string;
  lastName: string;
  hashPassword: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  role: UserRole;
};

export type AddUserReq = Omit<AuthUser, 'hashPassword' | 'createdAt' | 'updatedAt'> & { password: string };
