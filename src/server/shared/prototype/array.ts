declare global {
  interface Array<T> {
    shuffle(): T[];
  }
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
