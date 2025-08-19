// src/client/locale/dayjs.ts
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import 'dayjs/locale/en';

// Set up dayjs locales
dayjs.locale('en');
dayjs.locale('he');

// Export dayjs instance
export default dayjs;
