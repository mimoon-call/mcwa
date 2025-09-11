import dayjs from '@client/locale/dayjs';
import { DateFormat } from '@client-constants';
import type { ChatContact } from '../store/chat.types';

/**
 * Formats a date string for display in chat components
 * @param dateString - The date string to format
 * @param t - Translation function for localized text
 * @param showFullDateTime - Whether to always show full date and time
 * @returns Formatted date string
 */
export const formatTime = (dateString: string, t: (key: string) => string, showFullDateTime = false): string => {
  const date = dayjs(dateString);
  const now = dayjs();

  // If showFullDateTime is true, always show full date and time
  if (showFullDateTime) {
    return date.format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT);
  }

  // If the date is today, show only time
  if (date.isSame(now, 'day')) {
    return date.format(DateFormat.TIME_FORMAT);
  }

  // If the date is yesterday, show "Yesterday" with time
  if (date.isSame(now.subtract(1, 'day'), 'day')) {
    return `${t('GENERAL.YESTERDAY')} ${date.format(DateFormat.TIME_FORMAT)}`;
  }

  // For all other dates (not today or yesterday), show full date and time
  return date.format(DateFormat.DAY_MONTH_YEAR_TIME_FORMAT);
};

/**
 * Gets the display name for a chat contact
 * @param contact - The chat contact object
 * @returns The display name (name or phone number)
 */
export const getDisplayName = (contact: ChatContact): string => {
  return contact.name || contact.phoneNumber;
};
