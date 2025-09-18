import { CellTypeEnum } from './cell-type.enum';

export interface CellHeader {
  title: string;
  value: string;
  type?: (typeof CellTypeEnum)[keyof typeof CellTypeEnum];
  width?: number;
  direction?: 'rtl' | 'ltr';
}

export interface ExportOptions {
  headers: Array<CellHeader>;
  data: Array<Record<string, any>>;
  sheetName?: string;
  direction?: 'rtl' | 'ltr';
}

export type CellConfig = Partial<Record<CellTypeEnum, string>>;

export interface ExportHelperConfig {
  formatCell?: CellConfig;
  direction?: 'rtl' | 'ltr';
}
