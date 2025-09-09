// src/client/shared/components/TextField/TextField.tsx
import type { ClassValue } from 'clsx';
import type { InputWrapperProps } from '@components/Fields/InputWrapper/InputWrapper.types';
import React, { type FC, type InputHTMLAttributes, useEffect, useRef, useCallback } from 'react';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import global from '@components/Fields/Fields.module.css';
import styles from '@components/Fields/TextField/TextField.module.css';
import { cn } from '@client/plugins';
import { onFieldChangeEvent } from '@components/Fields/Fields.helpers';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';

type TextFieldProps = InputWrapperProps & {
  className?: ClassValue;
  containerClass?: ClassValue;
  clearable?: boolean;
  beforeChange?: (value: string) => string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'pattern'>;

type InputProps = Pick<InputWrapperProps, 'onChange' | 'pattern'> &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'pattern' | 'className'> & {
    clearable?: boolean;
    beforeChange?: (value: string) => string;
    className?: ClassValue;
  };

const Input: FC<InputProps> = ({ onChange, className, pattern, value, disabled, clearable = false, beforeChange, ...rest }) => {
  const localValue = useRef<string>(value?.toString() || '');

  useEffect(() => {
    if (typeof value === 'string') {
      localValue.current = value;
    }
  }, [value]);

  // Handle clear selection
  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.('');
    },
    [onChange]
  );

  return (
    <div className={styles['text-field-container']}>
      <input
        className={cn(
          global['field'],
          styles['text-field'],
          className,
          disabled && '!bg-gray-200 !text-gray-600',
          clearable && value && styles['with-clear']
        )}
        value={value}
        disabled={disabled}
        onChange={onChange ? onFieldChangeEvent(onChange, localValue.current, pattern, beforeChange) : undefined}
        {...rest}
      />

      {clearable && value && !disabled && (
        <Icon
          name="svg:x-mark"
          size="0.875rem"
          className={styles['text-field-clear']}
          onClick={handleClear}
          role="button"
          tabIndex={-1}
          aria-label="Clear input"
        />
      )}
    </div>
  );
};

const TextField: FC<TextFieldProps> = (props) => {
  const { t } = useTranslation();
  const { className, onChange, name, label, rules, value = '', hideDetails, clearable = false, beforeChange, containerClass, ...rest } = props;

  const placeholder = rest.placeholder ? t(rest.placeholder) : undefined;

  return (
    <InputWrapper className={cn(className)} name={name} label={label} rules={rules} hideDetails={hideDetails} value={value} onChange={onChange}>
      <Input
        {...rest}
        className={containerClass}
        value={value}
        placeholder={placeholder}
        clearable={clearable}
        beforeChange={beforeChange}
        onChange={(ev) => onChange?.(ev.target.value)}
      />
    </InputWrapper>
  );
};

export default TextField;
