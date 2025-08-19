// src/client/shared/helpers/number-with-commas.ts
export const numberWithCommas = (value: number | string, symbol = ','): string => {
  const num = Math.round(Number(value) * 100) / 100;

  return num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, symbol) || '';
};
