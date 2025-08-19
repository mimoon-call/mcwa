import React from 'react';

const timeoutMap = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Simple field update handler that debounces updates for each field individually
 * @param data - Data object containing the fields to update
 * @param idKey - The key of the ID field (will be excluded from individual updates)
 * @param updateCallback - Function to call with the updated data
 * @param delay - Delay in milliseconds before applying the update (default: 5000)
 */
export const itemUpdateHandler = <T extends object>(idKey: keyof T, updateCallback: (data: Partial<T>) => void, delay: number = 5000) => {
  return (data: Partial<T>) => {
    Object.entries(data).forEach(([fieldKey, fieldValue]) => {
      if (fieldKey === idKey) {
        return;
      }

      const timeoutKey = [idKey, fieldKey].join(':');
      clearTimeout(timeoutMap.get(timeoutKey));

      // Create temporary marked data with JSX span
      const tempData = { [idKey]: data[idKey], [fieldKey]: <span className="text-red-800">{String(fieldValue)}</span> } as Partial<T>;
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
