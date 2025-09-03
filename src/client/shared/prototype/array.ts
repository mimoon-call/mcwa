import { isEqual, pick } from 'lodash';

declare global {
  interface Array<T extends object> {
    uniqueBy<K extends keyof T>(keys: K[]): T[];
    shuffle(): T[];
  }
}

if (!Array.prototype.uniqueBy) {
  Object.defineProperty(Array.prototype, 'uniqueBy', {
    value: function <T extends object, K extends keyof T>(this: T[], keys: K[]): T[] {
      const result: T[] = [];

      for (const item of this) {
        const candidate = pick(item, keys);

        const exists = result.some((r) => isEqual(pick(r, keys), candidate));

        if (!exists) {
          result.push(item);
        }
      }

      return result;
    },
    enumerable: false,
  });
}

if (!Array.prototype.shuffle) {
  Object.defineProperty(Array.prototype, 'shuffle', {
    value: function <T>(this: T[]): T[] {
      const result = [...this];

      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }

      return result;
    },
    enumerable: false,
  });
}
