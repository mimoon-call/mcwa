import type { TableHeader } from '@components/Table/Table.type';

const timeoutMap = new Map<string, ReturnType<typeof setTimeout>>();
const tempElementMap = new Map<string, HTMLElement>();

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

      const timeoutKey = `${String(data[idKey])}:${fieldKey}`;
      clearTimeout(timeoutMap.get(timeoutKey));
      const valueFormatter = fieldFormatter?.[fieldKey as keyof typeof fieldFormatter];
      const tempValue = valueFormatter ? valueFormatter(fieldValue) : fieldValue;

      // Update Redux with the actual value (no JSX)
      updateCallback({ [idKey]: data[idKey], [fieldKey]: fieldValue } as Partial<T>);

      // Apply temporary styling via DOM manipulation instead of Redux
      setTimeout(() => {
        // Find the table row by looking for the ID value in the row content
        const rows = document.querySelectorAll('tbody tr');
        let targetCell: HTMLElement | null = null;
        
        Array.from(rows).some((row) => {
          const rowText = row.textContent || '';
          if (rowText.includes(String(data[idKey]))) {
            // Find the specific cell by looking for the field value
            const cells = row.querySelectorAll('td');
            return Array.from(cells).some((cell) => {
              if (cell.textContent?.includes(String(tempValue))) {
                targetCell = cell as HTMLElement;
                return true;
              }
              return false;
            });
          }
          return false;
        });
        
        if (targetCell) {
          (targetCell as HTMLElement).classList.add('text-red-800', 'font-semibold');
          tempElementMap.set(timeoutKey, targetCell as HTMLElement);
        }
      }, 0);

      const timeoutId = setTimeout(() => {
        timeoutMap.delete(timeoutKey);
        
        // Remove temporary styling
        const element = tempElementMap.get(timeoutKey);
        if (element) {
          element.classList.remove('text-red-800', 'font-semibold');
          tempElementMap.delete(timeoutKey);
        }
      }, delay);

      timeoutMap.set(timeoutKey, timeoutId);
    });
  };
};
