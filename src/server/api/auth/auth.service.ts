import type { AddUserReq } from '@server/api/auth/auth.type';
import type { AccessToken } from '@server/services/token/token.type';
import { ADD_USER, LOGIN } from '@server/api/auth/auth.map';
import { Auth } from '@server/api/auth/auth.db';
import TokenService from '@server/services/token/token.service';
import AuthenticationError from '@server/middleware/errors/authentication-error';
import bcrypt from '@server/helpers/bcrypt';
import getLocalTime from '@server/helpers/get-local-time';

const authService = {
  [LOGIN]: async (email: string, password: string): Promise<string> => {
    const user = await Auth.findOne({ email });

    if (!user || !bcrypt.compare(password, user.hashPassword)) {
      throw new AuthenticationError('Invalid Credentials');
    }

    const { _id, firstName, lastName, hashPassword } = user;

    return TokenService.encrypt<AccessToken>({ id: _id.toString(), firstName, lastName, email, hashPassword });
  },

  [ADD_USER]: async ({ password, ...data }: AddUserReq): Promise<void> => {
    const hashPassword = bcrypt.hash(password);
    const now = getLocalTime();

    await Auth.create({ ...data, hashPassword, createdAt: now });
  },
};

export default authService;
