import type { ClassValue } from 'clsx';
import React from 'react';
import { cn } from '@client/plugins';

type CheckboxProps = {
  id?: string;
  label?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  className?: ClassValue;
};

export const Checkbox: React.FC<CheckboxProps> = ({ id, label, checked, defaultChecked, disabled = false, className, onChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.checked);
  };

  return (
    <label htmlFor={id} className={cn('inline-flex items-center gap-2 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed', className)}>
      <input
        id={id}
        type="checkbox"
        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-blue-500"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={handleChange}
      />
      {label && <span>{label}</span>}
    </label>
  );
};
