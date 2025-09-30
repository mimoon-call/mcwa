import React, { type FC, type ReactNode } from 'react';
import styles from './Spinner.module.css';
import type { SizeUnit } from '@models';
import { useTranslation } from 'react-i18next';
import type { ClassValue } from 'clsx';
import { cn } from '@client/plugins';

type SpinnerProps = Partial<{ loading: boolean; ariaLabel: string; size: SizeUnit; children: ReactNode; className: ClassValue }>;

const Spinner: FC<SpinnerProps> = ({ loading = true, ariaLabel = 'GENERAL.LOADING', size, className, children }) => {
  if (!loading) {
    return null;
  }

  const { t } = useTranslation();
  const style = size ? { width: size, height: size } : undefined;

  return (
    <div className={cn(styles['spinner'], className)} aria-label={t(ariaLabel)} style={style}>
      {children}
    </div>
  );
};

export default Spinner;
