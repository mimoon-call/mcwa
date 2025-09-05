import isEqual from 'lodash/isEqual';
import pick from 'lodash/pick';

export default <T extends object>(arr: T[], keys: (keyof T)[]): T[] => {
  const result: T[] = [];

  for (const item of arr) {
    const candidate = pick(item, keys);

    // Check if we already have an item with the same picked subset
    const exists = result.some((r) => isEqual(pick(r, keys), candidate));

    if (!exists) {
      result.push(item);
    }
  }

  return result;
};
