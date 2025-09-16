import parsePhoneNumberFromString from 'libphonenumber-js';

export const internationalPhonePrettier = (phone: string, separator: string = '-', toLocalFlag: boolean = false) => {
  if (!phone) return phone;

  const phoneNumber = parsePhoneNumberFromString(phone.charAt(0) === '+' ? phone : '+' + phone);
  if (!phoneNumber) return phone; // Return original phone if parsing fails

  return toLocalFlag ? phoneNumber.formatNational().replace(/\s+/g, separator) : phoneNumber.formatInternational().replace(/\s+/g, separator);
};
