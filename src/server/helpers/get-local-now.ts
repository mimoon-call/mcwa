import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Extend dayjs with timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Get current time in local timezone
const getLocalNow = () => {
  const timezone = process.env.TIMEZONE || 'Asia/Jerusalem';

  return dayjs().tz(timezone).toDate();
};

export default getLocalNow;
