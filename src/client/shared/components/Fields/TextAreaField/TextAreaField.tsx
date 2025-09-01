// src/client/shared/components/TextAreaField/TextAreaField.tsx
import type { ClassValue } from 'clsx';
import type { InputWrapperProps } from '@components/Fields/InputWrapper/InputWrapper.types';
import React, { type TextareaHTMLAttributes, useEffect, useRef, forwardRef } from 'react';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import global from '@components/Fields/Fields.module.css';
import styles from '@components/Fields/TextAreaField/TextAreaField.module.css';
import { cn } from '@client/plugins';
import { onFieldChangeEvent } from '@components/Fields/Fields.helpers';

type TextAreaFieldProps = InputWrapperProps & {
  className?: ClassValue;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'pattern'>;

type TextareaProps = Pick<InputWrapperProps, 'onChange' | 'pattern'> & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'pattern'>;

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ onChange, className, pattern, value, ...rest }, ref) => {
  const localValue = useRef<string>(value?.toString() || '');

  useEffect(() => {
    if (typeof value === 'string') {
      localValue.current = value;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={cn(global['field'], styles['text-area'], className)}
      value={value}
      onChange={onChange ? onFieldChangeEvent(onChange, localValue.current, pattern) : undefined}
      {...rest}
    />
  );
});

Textarea.displayName = 'Textarea';

const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>((props, ref) => {
  const { className, onChange, name, label, rules, value, ...rest } = props;

  return (
    <InputWrapper className={cn(className)} name={name} label={label} rules={rules} value={value} onChange={onChange}>
      <Textarea ref={ref} {...rest} value={value} onChange={(ev) => onChange?.(ev.target.value)} />
    </InputWrapper>
  );
});

TextAreaField.displayName = 'TextAreaField';

export default TextAreaField;
