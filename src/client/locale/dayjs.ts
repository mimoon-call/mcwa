// src/client/locale/dayjs.ts
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import 'dayjs/locale/en';
import relativeTime from 'dayjs/plugin/relativeTime';

// Extend dayjs with relativeTime plugin
dayjs.extend(relativeTime);

// Set up dayjs locales
dayjs.locale('en');
dayjs.locale('he');

// Export dayjs instance
export default dayjs;
