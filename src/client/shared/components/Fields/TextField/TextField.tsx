// src/client/shared/components/TextField/TextField.tsx
import type { ClassValue } from 'clsx';
import type { InputWrapperProps } from '@components/Fields/InputWrapper/InputWrapper.types';
import React, { type FC, type InputHTMLAttributes, useEffect, useRef } from 'react';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import global from '@components/Fields/Fields.module.css';
import styles from '@components/Fields/TextField/TextField.module.css';
import { cn } from '@client/plugins';
import { onFieldChangeEvent } from '@components/Fields/Fields.helpers';
import { useTranslation } from 'react-i18next';

type TextFieldProps = InputWrapperProps & {
  className?: ClassValue;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'pattern'>;

type InputProps = Pick<InputWrapperProps, 'onChange' | 'pattern'> & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'pattern'>;

const Input: FC<InputProps> = ({ onChange, className, pattern, value, disabled, ...rest }) => {
  const localValue = useRef<string>(value?.toString() || '');

  useEffect(() => {
    if (typeof value === 'string') {
      localValue.current = value;
    }
  }, [value]);

  return (
    <input
      className={cn(global['field'], styles['text-field'], className, disabled && '!bg-gray-200 !text-gray-600')}
      value={value}
      disabled={disabled}
      onChange={onChange ? onFieldChangeEvent(onChange, localValue.current, pattern) : undefined}
      {...rest}
    />
  );
};

const TextField: FC<TextFieldProps> = (props) => {
  const { t } = useTranslation();
  const { className, onChange, name, label, rules, value, hideDetails, ...rest } = props;

  const placeholder = rest.placeholder ? t(rest.placeholder) : undefined;

  return (
    <InputWrapper className={cn(className)} name={name} label={label} rules={rules} hideDetails={hideDetails} value={value} onChange={onChange}>
      <Input {...rest} value={value} placeholder={placeholder} onChange={(ev) => onChange?.(ev.target.value)} />
    </InputWrapper>
  );
};

export default TextField;
