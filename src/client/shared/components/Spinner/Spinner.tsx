import React, { type FC, type ReactNode } from 'react';
import styles from './Spinner.module.css';
import type { SizeUnit } from '@models';
import { useTranslation } from 'react-i18next';

type SpinnerProps = Partial<{ loading?: boolean; ariaLabel?: string; size?: SizeUnit; children?: ReactNode }>;

const Spinner: FC<SpinnerProps> = ({ loading = true, ariaLabel = 'GENERAL.LOADING', size, children }) => {
  if (!loading) {
    return null;
  }

  const { t } = useTranslation();
  const style = size ? { width: size, height: size } : undefined;

  return (
    <div className={styles['spinner']} aria-label={t(ariaLabel)} style={style}>
      {children}
    </div>
  );
};

export default Spinner;
