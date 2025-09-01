import React, { useState, useEffect } from 'react';
import { useGlobalState } from '@client/store/global.hooks';
import type { ClassValue } from 'clsx';
import { cn } from '@client/plugins';
import { useTranslation } from 'react-i18next';
import dayjs from '@client/locale/dayjs';

export const NextWarmCountdown = ({ className }: { className?: ClassValue }) => {
  const { t } = useTranslation();
  const { nextWarmAt } = useGlobalState();
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!nextWarmAt) {
      setTimeLeft('');
      return;
    }

    const updateCountdown = () => {
      const now = dayjs();
      const targetTime = dayjs(nextWarmAt);
      const diff = targetTime.diff(now);

      if (diff <= 0) {
        setTimeLeft(t('INSTANCE.WARMUP.STARTED', 'Warm up started'));
        return;
      }

      // Use dayjs to format the time difference
      const duration = dayjs.duration(diff);
      const hours = Math.floor(duration.asHours());
      const minutes = duration.minutes();
      const seconds = duration.seconds();

      if (hours > 0) {
        setTimeLeft(t('INSTANCE.COUNTDOWN.HOURS', '{{hours}}h {{minutes}}m {{seconds}}s', { hours, minutes, seconds }));
      } else if (minutes > 0) {
        setTimeLeft(t('INSTANCE.COUNTDOWN.MINUTES', '{{minutes}}m {{seconds}}s', { minutes, seconds }));
      } else {
        setTimeLeft(t('INSTANCE.COUNTDOWN.SECONDS', '{{seconds}}s', { seconds }));
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [nextWarmAt, t]);

  if (!nextWarmAt || !timeLeft) {
    return null;
  }

  return <div className={cn('px-2', className)}>{t('INSTANCE.COUNTDOWN.NEXT_WARMUP', 'Next warm up start in {{timeLeft}}', { timeLeft })}</div>;
};
