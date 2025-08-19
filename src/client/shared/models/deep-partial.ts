export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (...args: Array<unknown>) => unknown ? T[P] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};
