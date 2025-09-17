import { isValidPhoneNumber as isValidPhoneNumberLib } from 'libphonenumber-js';

/**
 * Validates if a string is a valid phone number using libphonenumber-js
 * Optimized for Israeli numbers in format "972XXXXXXXXX"
 */
const isValidPhoneNumber = (phone: unknown): boolean => {
  if (!phone || typeof phone !== 'string') return false;

  const cleanPhone = phone.trim();

  try {
    // Handle Israeli numbers in format "972XXXXXXXXX"
    if (/^972\d{9}$/.test(cleanPhone)) {
      return isValidPhoneNumberLib(`+${cleanPhone}`, 'IL');
    }

    // Handle other Israeli formats
    if (cleanPhone.startsWith('+972') || cleanPhone.startsWith('972') || /^0[0-9]/.test(cleanPhone)) {
      return isValidPhoneNumberLib(cleanPhone, 'IL');
    }

    // Handle international numbers
    if (cleanPhone.startsWith('+')) {
      return isValidPhoneNumberLib(cleanPhone);
    }

    // Try to parse as Israeli number without country code
    if (/^0[0-9]/.test(cleanPhone)) {
      return isValidPhoneNumberLib(`+972${cleanPhone.substring(1)}`, 'IL');
    }

    // Fallback: try to parse as any valid international number
    return isValidPhoneNumberLib(cleanPhone);
  } catch (_error) {
    return false;
  }
};

/**
 * Finds the field name with the highest number of valid phone numbers
 * @param data Array of objects to analyze
 * @returns The field name with the most valid phone numbers, or null if no valid phones found
 */
export const findPhoneField = (data: Record<string, unknown>[]): string | null => {
  if (!data || data.length === 0) return null;

  // Get all field names from the first object
  const fieldNames = Object.keys(data[0]);

  let bestField = '';
  let maxValidCount = 0;

  for (const fieldName of fieldNames) {
    const values = data.map((row) => row[fieldName] || '');
    const validCount = values.filter((value) => isValidPhoneNumber(value)).length;

    if (validCount > maxValidCount) {
      maxValidCount = validCount;
      bestField = fieldName;
    }
  }

  return maxValidCount > 0 ? bestField : null;
};

export default findPhoneField;
