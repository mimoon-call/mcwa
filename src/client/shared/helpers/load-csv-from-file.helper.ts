// src/client/shared/helpers/load-csv-from-file.helper.ts

/**
 * Load CSV content from a file (Blob or File) in the browser.
 *
 * @param file            A File or Blob (e.g. from <input type="file">)
 * @param columns         The array of field names
 * @param skipFirstLine   Whether to skip the first line (usually header)
 * @param uniqueColumns   Optional array of column names to use for deduplication
 */

async function loadCsvFromFile<T extends readonly object[]>(
  file: Blob,
  columns: Array<keyof T[0]>,
  skipFirstLine: boolean,
  uniqueColumns?: Array<keyof T[0]>
): Promise<Array<Record<keyof T[0], string>>> {
  if (file.type !== 'text/csv') {
    throw new Error('Invalid file type');
  }

  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);

  const dataLines = skipFirstLine ? lines.slice(1) : lines;
  const seenValues = new Set<string>();
  const result: Array<Record<keyof T[0], string>> = [];

  for (let rowIdx = 0; rowIdx < dataLines.length; rowIdx++) {
    const line = dataLines[rowIdx];
    const cells = line.split(',');

    if (cells.length !== columns.length) {
      throw new Error(`Row ${rowIdx + 1} has ${cells.length} columns, expected ${columns.length}`);
    }

    const row = columns.reduce(
      (acc, col, i) => {
        acc[col] = cells[i]?.trim() ?? '';

        return acc;
      },
      {} as Record<keyof T[0], string>
    );

    if (uniqueColumns && uniqueColumns.length > 0) {
      const uniqueKey = uniqueColumns.map((col) => row[col]).join('|');

      if (seenValues.has(uniqueKey)) {
        continue;
      }

      seenValues.add(uniqueKey);
    }

    result.push(row);
  }

  return result;
}

export default loadCsvFromFile;
