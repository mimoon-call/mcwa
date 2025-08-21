export const DateFormat = {
  US_DATE: 'YYYY MM DD',
  DAY_MONTH_YEAR_FORMAT: 'DD/MM/YYYY',
  SHORT_DAY_MONTH_YEAR_FORMAT: 'DD/MM/YY',
  DAY_MONTH_YEAR_TIME_FORMAT: 'DD/MM/YYYY HH:mm',
  EU_LONG_DATE_FORMAT: 'DD MMM YYYY',
  TIME_FORMAT: 'HH:mm',
  FULL_DAY: 'dddd',
  WEEK_DAY_MONTH_YEAR_FORMAT: 'DD/MM/YYYY dddd',
  FULL_DATE_AND_TIME: 'dddd DD MMM YYYY, HH:mm',
  FULL_DATE: 'dddd, DD MMM YYYY',
  FULL_DATE_WITHOUT_DAY: 'DD MMM YYYY',
  SHORT_DAY_MONTH: 'DD/MM',
};

/**
 * Formats a time difference in a human-readable format
 * @param targetDate - The target date to calculate time until
 * @returns Formatted string like "2 hours, 30 minutes" or "45 minutes"
 */
export const formatTimeUntil = (targetDate: Date | string): string => {
  const now = new Date();
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return 'now';
  }
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours === 0) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  }
  
  if (diffMinutes === 0) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
  }
  
  return `${diffHours} hour${diffHours !== 1 ? 's' : ''}, ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
};
