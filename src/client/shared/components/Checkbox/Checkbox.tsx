import type { ClassValue } from 'clsx';
import React, { type ReactNode } from 'react';
import { cn } from '@client/plugins';
import { useTranslation } from 'react-i18next';

type CheckboxProps = {
  id?: string;
  label?: string | ReactNode;
  value?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  className?: ClassValue;
};

export const Checkbox: React.FC<CheckboxProps> = ({ id, label, value = false, defaultChecked, disabled = false, className, onChange }) => {
  const { t } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.checked);
  };

  const checkboxLabel = typeof label === 'string' ? <span>{t(label)}</span> : label;

  return (
    <label
      htmlFor={id}
      className={cn('inline-flex items-center gap-2 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className)}
    >
      <input
        id={id}
        type="checkbox"
        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-blue-500"
        checked={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={handleChange}
      />
      {checkboxLabel}
    </label>
  );
};
