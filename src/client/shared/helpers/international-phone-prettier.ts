import parsePhoneNumberFromString from 'libphonenumber-js';

export const internationalPhonePrettier = (phone: string, separator: string = '-', toLocalFlag: boolean = false) => {
  if (!phone) return phone;

  let formattedPhone = parsePhoneNumberFromString(phone.charAt(0) === '+' ? phone : '+' + phone)
    ?.formatInternational()
    .replace(/\s+/g, separator);

  if (!formattedPhone) {
    return phone; // Return original phone if parsing fails
  }

  if (toLocalFlag) {
    formattedPhone = '0' + formattedPhone?.split(separator).slice(1).join(separator);
  }

  return formattedPhone;
};
