import type { AccessToken } from '@server/services/token/token.type';
import { LOGIN } from '@server/api/auth/auth.map';

const authService = {
  [LOGIN]: async (email: string, password: string): Promise<AccessToken> => {
    return { id: 123, email, hashedPass: password };
  },
};

export default authService;
