// src/server/helpers/load-csv-from-buffer.helper.ts

/**
 * Parses a CSV buffer (e.g., from multer) into an array of objects.
 *
 * @param buffer          The CSV file content as a Node.js Buffer
 * @param columns         The array of field names (e.g. ['firstName', 'lastName'])
 * @param skipFirstLine   Whether to skip the first line (e.g. headers from Excel)
 */

function loadCsvFromBuffer<T extends readonly string[]>(buffer: Buffer | Blob, columns: T, skipFirstLine = false): Record<T[number], string>[] {
  const content = buffer.toString('utf8');
  const lines = content.trim().split(/\r?\n/);

  const dataLines = skipFirstLine ? lines.slice(1) : lines;

  return dataLines.map((line, rowIdx) => {
    const cells = line.split(',');

    if (cells.length !== columns.length) {
      throw new Error(`Row ${rowIdx + 1} has ${cells.length} columns, expected ${columns.length}`);
    }

    return columns.reduce(
      (acc, col, i) => {
        acc[col as keyof typeof acc] = cells[i]?.trim() ?? '';

        return acc;
      },
      {} as Record<T[number], string>
    );
  });
}

export default loadCsvFromBuffer;
