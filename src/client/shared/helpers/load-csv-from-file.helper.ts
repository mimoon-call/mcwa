// src/client/shared/helpers/load-csv-from-file.helper.ts

/**
 * Load CSV content from a file (Blob or File) in the browser.
 *
 * @param file            A File or Blob (e.g. from <input type="file">)
 * @param columns         The array of field names
 * @param isHeadersIncluded   Whether to skip the first line (usually header)
 */

async function loadCsvFromFile<T extends object>(
  file: Blob,
  columns: (keyof T)[],
  isHeadersIncluded: boolean
): Promise<[Record<keyof T, string>[], Record<string, string>]> {
  if (file.type !== 'text/csv') {
    throw new Error('Invalid file type');
  }

  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);

  const dataLines = isHeadersIncluded ? lines.slice(1) : lines;
  const headers = isHeadersIncluded
    ? lines[0].split(',').reduce((acc: Record<string, string>, value, index) => {
        return { ...acc, [columns[index] as string]: value };
      }, {})
    : {};

  const data = dataLines.map((line, rowIdx) => {
    const cells = line.split(',');

    if (cells.length !== columns.length) {
      throw new Error(`Row ${rowIdx + 1} has ${cells.length} columns, expected ${columns.length}`);
    }

    return columns.reduce(
      (acc, col, i) => {
        acc[col as keyof T] = cells[i]?.trim() ?? '';

        return acc;
      },
      {} as Record<keyof T, string>
    );
  });

  return [data, headers];
}

export default loadCsvFromFile;
