import type { Request, Response } from 'express';
import type { AccessToken } from '@server/services/token/token.type';
import type { LoginReq, LoginRes, LogoutRes } from '@server/api/auth/auth.type';
import TokenService from '@server/services/token/token.service';
import { LOGIN, LOGOUT, REFRESH_TOKEN } from './auth.map';
import { COOKIE_OPTIONS } from './auth.constants';
import { CookieEnum, RegexPattern } from '@server/constants';
import authService from './auth.service';
import RecordValidator from '@server/services/record-validator';

const authController = {
  [LOGIN]: async (req: Request<never, never, LoginReq>, res: Response<LoginRes>) => {
    try {
      const { email, password } = await new RecordValidator(req.body, [
        ['email', { required: [true], type: ['String'], regex: [RegexPattern.EMAIL] }],
        ['password', { required: [true], type: ['String'] }],
      ]).validate();

      const accessToken = TokenService.encrypt<AccessToken>(await authService[LOGIN](email, password));

      res.cookie(CookieEnum.ACCESS_TOKEN, accessToken, COOKIE_OPTIONS).send({ returnCode: 0 });
    } catch (err) {
      res.clearCookie(CookieEnum.ACCESS_TOKEN);

      throw err;
    }
  },

  [LOGOUT]: async (_req: Request, res: Response<LogoutRes>) => {
    res.clearCookie(CookieEnum.ACCESS_TOKEN).send({ returnCode: 0 });
  },

  [REFRESH_TOKEN]: async (req: Request, res: Response<LoginRes>) => {
    const accessToken = req.cookies[CookieEnum.ACCESS_TOKEN];

    if (accessToken) {
      res.cookie(CookieEnum.ACCESS_TOKEN, accessToken, COOKIE_OPTIONS).send({ returnCode: 0 });
    } else {
      res.clearCookie(CookieEnum.ACCESS_TOKEN).send({ returnCode: 1 });
    }
  },
};

export default authController;
