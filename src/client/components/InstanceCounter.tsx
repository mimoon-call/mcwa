import type { RootState } from '@client/store';
import type { ClassValue } from 'clsx';
import React from 'react';
import { useSelector } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import { cn } from '@client/plugins';
import { useTranslation } from 'react-i18next';

const InstanceCounter = ({ className }: { className?: ClassValue }) => {
  const { t } = useTranslation();

  const { readyCount, totalCount } = useSelector((state: RootState) => state[StoreEnum.global]);

  return (
    <div className={cn('px-2 flex gap-2', className)}>
      <span>{t('INSTANCE.TITLE')}</span>

      <span dir="ltr">{[readyCount, totalCount].join(' / ')}</span>
    </div>
  );
};

export default InstanceCounter;
