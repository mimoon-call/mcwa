// src/client/shared/components/TextAreaField/TextAreaField.tsx
import type { ClassValue } from 'clsx';
import type { InputWrapperProps } from '@components/Fields/InputWrapper/InputWrapper.types';
import React, { type FC, type TextareaHTMLAttributes, useEffect, useRef } from 'react';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import global from '@components/Fields/Fields.module.css';
import styles from '@components/Fields/TextAreaField/TextAreaField.module.css';
import { cn } from '@client/plugins';
import { onFieldChangeEvent } from '@components/Fields/Fields.helpers';

type TextAreaFieldProps = InputWrapperProps & {
  className?: ClassValue;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'pattern'>;

type TextareaProps = Pick<InputWrapperProps, 'onChange' | 'pattern'> & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'pattern'>;

const Textarea: FC<TextareaProps> = ({ onChange, className, pattern, value, ...rest }) => {
  const localValue = useRef<string>(value?.toString() || '');

  useEffect(() => {
    if (typeof value === 'string') {
      localValue.current = value;
    }
  }, [value]);

  return (
    <textarea
      className={cn(global['field'], styles['text-area'], className)}
      value={value}
      onChange={onFieldChangeEvent(onChange, localValue.current, pattern)}
      {...rest}
    />
  );
};

const TextAreaField: FC<TextAreaFieldProps> = (props) => {
  const { className, onChange, name, label, rules, value, ...rest } = props;

  return (
    <InputWrapper className={cn(className)} name={name} label={label} rules={rules} value={value} onChange={onChange}>
      <Textarea {...rest} value={value} onChange={(ev) => onChange(ev.target.value)} />
    </InputWrapper>
  );
};

export default TextAreaField;
