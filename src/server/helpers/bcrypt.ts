import bcrypt from 'bcryptjs';

const SALT_ROUNDS: number = 10;

const hash = (password: string): string => {
  return bcrypt.hashSync(password, SALT_ROUNDS);
};

const compare = (password: string, hash: string): boolean => {
  return bcrypt.compareSync(password, hash);
};

export default { hash, compare };
