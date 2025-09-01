// src/client/locale/dayjs.ts
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import 'dayjs/locale/en';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

// Extend dayjs with plugins
dayjs.extend(relativeTime);
dayjs.extend(duration);

// Set up dayjs locales
dayjs.locale('en');
dayjs.locale('he');

// Export dayjs instance
export default dayjs;
