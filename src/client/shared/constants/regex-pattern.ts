export const RegexPattern = {
  PHONE: /^\+?\d{7,}$/,
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE_INPUT: /^\+?\d*$/,
  EMAIL_INPUT: /^$|^[a-zA-Z0-9._%+-]*@?[a-zA-Z0-9.-]*$/,
  PRICE_INPUT: /^(?:\d{1,8}|\d{0,8}\.\d{0,2}|\.\d{1,2})$/,
  PHONE_IL: /^972\d{9}$/,
  MOBILE_PHONE_IL: /^9725\d{8}$/,
};
