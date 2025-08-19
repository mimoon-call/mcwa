import type { CustomValidator } from '@services/field-validator/field-validator.type';

export const israeliIdValidator: CustomValidator = (value: any) => {
  // If value is undefined, null, or empty, return true (no validation error)
  if (!value || (typeof value !== 'string' && typeof value !== 'number')) {
    return [true];
  }

  const strId = String(value).trim();

  if (/[^0-9]/.test(strId)) {
    // If the value contains non-numeric characters, return false with an error message
    return [false, 'VALIDATE.INVALID_ID_NUMBER'];
  }

  // Skip validation until the ID is at least 5 characters long (no validation error)
  if (!/^\d{5,9}$/.test(strId)) {
    return [true];
  }

  const paddedId = strId.padStart(9, '0');

  let sum = 0;

  for (let i = 0; i < 9; i++) {
    let num = Number(paddedId[i]) * ((i % 2) + 1); // Multiply alternately by 1 and 2

    if (num > 9) {
      num -= 9;
    }

    sum += num;
  }

  return [sum % 10 === 0, 'VALIDATE.INVALID_ID_NUMBER'];
};
