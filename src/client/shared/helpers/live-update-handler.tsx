import React from 'react';
import type { TableHeader } from '@components/Table/Table.type';

const timeoutMap = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Simple field update handler that debounces updates for each field individually
 * @param idKey - The key of the ID field (will be excluded from individual updates)
 * @param updateCallback - Function to call with the updated data
 * @param fieldFormatter
 * @param delay
 */
export const liveUpdateHandler = <T extends object>(
  idKey: keyof T,
  updateCallback: (data: Partial<T>) => void,
  fieldFormatter?: Record<keyof T, TableHeader<T>['valueFormatter']>,
  delay: number = 5000
) => {
  return (data: Partial<T>) => {
    Object.entries(data).forEach(([fieldKey, fieldValue]) => {
      if (fieldKey === idKey) {
        return;
      }

      if (typeof fieldValue !== 'string' && typeof fieldValue !== 'number') {
        updateCallback({ [idKey]: data[idKey], [fieldKey]: fieldValue } as Partial<T>);

        return;
      }

      const timeoutKey = [idKey, fieldKey].join(':');
      clearTimeout(timeoutMap.get(timeoutKey));
      const valueFormatter = fieldFormatter?.[fieldKey as keyof typeof fieldFormatter];
      const tempValue = valueFormatter ? valueFormatter(fieldValue) : fieldValue;

      // Create temporary marked data with JSX span
      const tempData = { [idKey]: data[idKey], [fieldKey]: <span className="text-red-800 font-semibold">{tempValue}</span> } as Partial<T>;
      updateCallback(tempData);

      const timeoutId = setTimeout(() => {
        timeoutMap.delete(timeoutKey);

        // Apply final update with original value
        updateCallback({ [idKey]: data[idKey], [fieldKey]: fieldValue } as Partial<T>);
      }, delay);

      timeoutMap.set(timeoutKey, timeoutId);
    });
  };
};
