import React, { useState, useEffect } from 'react';
import { useGlobalState } from '@client/store';

export const NextWarmCountdown: React.FC = () => {
  const { nextWarmAt } = useGlobalState();
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!nextWarmAt) {
      setTimeLeft('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = nextWarmAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('Warm up started');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [nextWarmAt]);

  if (!nextWarmAt || !timeLeft) {
    return null;
  }

  return <div className="text-sm text-gray-600">Next warm up start in {timeLeft}</div>;
};
