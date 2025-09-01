import React, { useState, useEffect } from 'react';
import { useGlobalState } from '@client/store/global.hooks';
import type { ClassValue } from 'clsx';
import { cn } from '@client/plugins';
import { useTranslation } from 'react-i18next';
import dayjs from '@client/locale/dayjs';
import getClientSocket from '@helpers/get-client-socket.helper';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@client/store';
import globalStore from '@client/store/global.slice';
import { InstanceEventEnum } from '@client/pages/Instance/constants/instance-event.enum';

export const NextWarmCountdown = ({ className }: { className?: ClassValue }) => {
  const { t } = useTranslation();
  const { nextWarmAt } = useGlobalState();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const dispatch = useDispatch<AppDispatch>();

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
      const h = String(Math.floor(duration.asHours())).padStart(2, '0').slice(-2);
      const m = duration.minutes().toString().padStart(2, '0').slice(-2);
      const s = duration.seconds().toString().padStart(2, '0').slice(-2);

      setTimeLeft([h, m, s].join(':'));
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [nextWarmAt, t]);

  useEffect(() => {
    const socket = getClientSocket();

    const update = ({ nextWarmAt }: { nextWarmAt: Date | string | null }) => {
      if (nextWarmAt) {
        const nextWarmTime = new Date(nextWarmAt);
        dispatch(globalStore.setNextWarmAt(nextWarmTime));
      } else {
        dispatch(globalStore.setNextWarmAt(null));
      }
    };

    socket?.on(InstanceEventEnum.INSTANCE_NEXT_WARM_AT, update);

    return () => {
      socket?.off(InstanceEventEnum.INSTANCE_NEXT_WARM_AT, update);
    };
  }, [dispatch]);

  if (!nextWarmAt || !timeLeft) {
    return null;
  }

  return <div className={cn('px-2', className)}>{t('INSTANCE.COUNTDOWN.NEXT_WARMUP', 'Next warm up start in {{timeLeft}}', { timeLeft })}</div>;
};
