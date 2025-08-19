import type { BaseResponse } from '@server/models';

export type LoginReq = { email: string; password: string };
export type LoginRes = BaseResponse;

export type LogoutRes = BaseResponse;
