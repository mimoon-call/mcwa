import * as XLSX from 'xlsx';
import type { CellConfig, ExportHelperConfig, ExportOptions } from './excel.type';
import { CellTypeEnum } from './cell-type.enum';

class ExcelService {
  private readonly direction: 'rtl' | 'ltr' = 'ltr';
  private readonly formatConfig: CellConfig = {};

  constructor(config: ExportHelperConfig = {}) {
    this.formatConfig = {
      [CellTypeEnum.DATE]: 'dd/mm/yyyy',
      [CellTypeEnum.TIME]: 'hh:mm',
      [CellTypeEnum.DATETIME]: 'dd/mm/yyyy hh:mm',
      [CellTypeEnum.PERCENTAGE]: '0.00%',
      [CellTypeEnum.DECIMAL]: '0.00',
      [CellTypeEnum.CURRENCY]: '"$"#,##0.00',
      ...(config.formatCell || {}),
    };

    this.direction = config.direction || 'ltr';
  }

  public export(options: ExportOptions | Array<ExportOptions>): Buffer {
    const optionList = Array.isArray(options) ? options : [options];
    const workbook = XLSX.utils.book_new();

    for (const option of optionList) {
      const { headers, data, sheetName = 'Sheet1', direction = this.direction } = option;

      const LRM = '\u200E';
      const RLM = '\u200F';

      const worksheetData = [
        headers.map((col) => col.title),
        ...data.map((row) =>
          headers.map((col) => {
            const rawValue = row[col.value as keyof typeof row];
            let value: any;

            switch (col.type) {
              case CellTypeEnum.NUMBER:
              case CellTypeEnum.DECIMAL:
              case CellTypeEnum.CURRENCY:
                value = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue as any);
                break;
              case CellTypeEnum.PERCENTAGE:
                value = typeof rawValue === 'number' ? rawValue / 100 : parseFloat(rawValue as any) / 100;
                break;
              case CellTypeEnum.DATE:
              case CellTypeEnum.TIME:
              case CellTypeEnum.DATETIME:
                value = rawValue ? new Date(rawValue as any) : '';
                break;
              default:
                value = rawValue ?? '';
            }

            if (col.type === CellTypeEnum.TEXT && typeof value === 'string' && col.direction && col.direction !== direction) {
              const mark = col.direction === 'rtl' ? RLM : LRM;
              value = mark + value;
            }

            return value;
          })
        ),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

      worksheet['!cols'] = headers.map((col) => {
        if (col.width) {
          return { wch: col.width };
        }

        switch (col.type) {
          case CellTypeEnum.DATE:
          case CellTypeEnum.TIME:
          case CellTypeEnum.DATETIME:
            return { wch: 18 };
          case CellTypeEnum.NUMBER:
          case CellTypeEnum.DECIMAL:
          case CellTypeEnum.PERCENTAGE:
          case CellTypeEnum.CURRENCY:
            return { wch: 12 };
          default:
            return { wch: 20 };
        }
      });

      for (let r = 1; r < worksheetData.length; r++) {
        for (let c = 0; c < headers.length; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = worksheet[cellRef];
          if (!cell) continue;

          cell.z = this.formatConfig[headers[c].type as CellTypeEnum];
        }
      }

      (worksheet as any)['!dir'] = direction;
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  }
}

export default ExcelService;
