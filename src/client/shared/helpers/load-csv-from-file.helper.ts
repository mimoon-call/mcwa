// src/client/shared/helpers/load-csv-from-file.helper.ts

/**
 * Load CSV content from a file (Blob or File) in the browser.
 *
 * @param file            A File or Blob (e.g. from <input type="file">)
 * @param columns         The array of field names (optional - if not provided, will use headers from CSV)
 */

async function loadCsvFromFile<T extends object>(file: Blob, columns?: (keyof T)[]): Promise<[Record<string, string>[], Record<string, string>]> {
  // Check if it's a CSV file by MIME type or file extension
  const isCsvByMimeType = file.type === 'text/csv' || file.type === 'application/csv';
  const isCsvByExtension = file instanceof File && file.name.toLowerCase().endsWith('.csv');

  if (!isCsvByMimeType && !isCsvByExtension) {
    throw new Error('Invalid file type. Please select a CSV file.');
  }

  const text = await file.text();

  if (!text.trim()) {
    throw new Error('The CSV file is empty.');
  }

  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim()); // Remove empty lines

  if (lines.length === 0) {
    throw new Error('No data found in the CSV file.');
  }

  // Determine columns - use provided columns or extract from headers
  let actualColumns: string[];
  let headers: Record<string, string> = {};

  if (!columns) {
    if (lines.length < 2) {
      throw new Error('CSV file has headers but no data rows.');
    }

    const headerLine = lines[0].split(',').map((h) => h.trim());
    actualColumns = columns || headerLine;

    // Create header mapping if columns were provided
    if (columns) {
      headers = headerLine.reduce((acc: Record<string, string>, value, index) => {
        return { ...acc, [columns[index] as string]: value };
      }, {});
    } else {
      // Use headers as-is for dynamic columns
      headers = headerLine.reduce((acc: Record<string, string>, value) => {
        return { ...acc, [value]: value };
      }, {});
    }
  } else {
    if (!columns) {
      throw new Error('Columns must be provided when headers are not included in CSV.');
    }
    actualColumns = columns as string[];
  }

  const dataLines = !columns ? lines.slice(1) : lines;
  
  const data = dataLines.map((line, rowIdx) => {
    const cells = line.split(',').map((cell) => cell.trim()).filter(Boolean);

    if (cells.length !== actualColumns.length) {
      throw new Error(
        `Row ${rowIdx + (!columns ? 2 : 1)} has ${cells.length} columns, expected ${actualColumns.length}. Expected columns: ${actualColumns.join(', ')}`
      );
    }

    return actualColumns.reduce(
      (acc, col, i) => {
        acc[col] = cells[i] ?? '';
        return acc;
      },
      {} as Record<string, string>
    );
  });

  return [data, headers];
}

export default loadCsvFromFile;
