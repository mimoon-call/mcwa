// src/client/shared/components/Fields/ToggleSwitch/ToggleSwitch.tsx
import React, { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassValue } from 'clsx';
import styles from '@components/Fields/ToggleSwitch/ToggleSwitch.module.css';
import { cn } from '@client/plugins';
import { useAsyncFn } from '@hooks';

type ToggleSwitchProps = {
  modelValue: boolean;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: ClassValue;
  onUpdateModelValue?: (value?: boolean) => Promise<unknown> | unknown;
  children?: ReactNode;
};

const ToggleSwitch: FC<ToggleSwitchProps> = (props) => {
  const { modelValue, label, disabled = false, loading = false, className, onUpdateModelValue, children } = props;

  const { t } = useTranslation();

  const { call: handleClick, loading: isCallbackLoading } = useAsyncFn(async () => {
    if (disabled || loading) {
      return;
    }

    await onUpdateModelValue?.(!modelValue);
  });

  return (
    <div
      className={cn(
        styles['toggle-switch'],
        {
          [styles['toggle-switch--checked']]: modelValue,
          [styles['toggle-switch--disabled']]: disabled,
        },
        className
      )}
      style={{}}
      onClick={(e) => e.stopPropagation()}
    >
      <label className="flex gap-1 items-center text-ellipsis cursor-pointer">
        <input type="checkbox" checked={modelValue} onChange={handleClick} className="hidden" />

        <div className={cn(styles['toggle-switch__switch'], { [styles.skeleton]: loading || isCallbackLoading })} />

        {(label || children) && <div className={cn(styles['toggle-switch__label'], 'ms-1')}>{children || (label && <span>{t(label)}</span>)}</div>}
      </label>
    </div>
  );
};

export default ToggleSwitch;
