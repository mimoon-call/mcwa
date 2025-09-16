import parsePhoneNumberFromString from 'libphonenumber-js';

export const internationalPhonePrettier = (phone: string | null | undefined, separator: string = '-', toLocalFlag: boolean = false) => {
  if (!phone || typeof phone !== 'string') return phone || '';

  const phoneNumber = parsePhoneNumberFromString(phone.charAt(0) === '+' ? phone : '+' + phone);
  if (!phoneNumber) return phone; // Return original phone if parsing fails

  return toLocalFlag ? phoneNumber.formatNational().replace(/\s+/g, separator) : phoneNumber.formatInternational().replace(/\s+/g, separator);
};
