import type { Pagination } from '@models';

const isIsoDateString = (value: unknown): boolean => {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
};

const isNumericString = (value: unknown): boolean => {
  return typeof value === 'string' && !isNaN(Number(value));
};

export const sortElementArray = <T extends object>(items?: Array<T>, sort?: Pagination['pageSort']): Array<T> => {
  if (!sort || Object.keys(sort).length === 0) {
    return items || [];
  }

  return [...(items || [])].sort((a, b) => {
    return Object.entries(sort).reduce((acc, [key, order]) => {
      if (acc !== 0) return acc;

      const aValue = a[key as keyof T];
      const bValue = b[key as keyof T];

      let aComparable: number | string | Date | null;
      let bComparable: number | string | Date | null;

      // Handle ISO date strings
      if (isIsoDateString(aValue)) {
        aComparable = new Date(aValue as string);
      } else if (isNumericString(aValue)) {
        aComparable = Number(aValue);
      } else {
        aComparable = aValue as string | number | Date | null;
      }

      if (isIsoDateString(bValue)) {
        bComparable = new Date(bValue as string);
      } else if (isNumericString(bValue)) {
        bComparable = Number(bValue);
      } else {
        bComparable = bValue as string | number | Date | null;
      }

      // Convert Date objects to timestamps
      if (aComparable instanceof Date) aComparable = aComparable.getTime();
      if (bComparable instanceof Date) bComparable = bComparable.getTime();

      // Final comparison
      if (typeof aComparable === 'number' && typeof bComparable === 'number') {
        return (aComparable - bComparable) * order;
      }

      if (typeof aComparable === 'string' && typeof bComparable === 'string') {
        return aComparable.localeCompare(bComparable) * order;
      }

      // Fallback comparison
      if (aComparable == null && bComparable != null) {
        return -1 * order;
      }

      if (aComparable != null && bComparable == null) {
        return 1 * order;
      }

      return 0;
    }, 0);
  });
};
