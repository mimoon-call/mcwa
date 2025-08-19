import type { BaseResponse } from '@server/models';

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
};

export type AddUserReq = Omit<AuthUser, 'hashPassword' | 'createdAt' | 'updatedAt'> & { password: string };
