// src/client/shared/components/TextField/TextField.tsx
import type { ClassValue } from 'clsx';
import type { InputWrapperProps } from '@components/Fields/InputWrapper/InputWrapper.types';
import React, { type InputHTMLAttributes, useEffect, useRef, useCallback, forwardRef } from 'react';
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
  AppendComponent?: ({ isHover, isFocus }: { isHover: boolean; isFocus: boolean }) => React.ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'pattern'>;

type InputProps = Pick<InputWrapperProps, 'onChange' | 'pattern'> &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'pattern' | 'className'> & {
    clearable?: boolean;
    beforeChange?: (value: string) => string;
    className?: ClassValue;
    AppendComponent?: ({ isHover, isFocus }: { isHover: boolean; isFocus: boolean }) => React.ReactNode;
  };

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ onChange, className, pattern, value, disabled, clearable = false, beforeChange, AppendComponent, ...rest }, ref) => {
    const localValue = useRef<string>(value?.toString() || '');
    const [isHover, setIsHover] = React.useState(false);
    const [isFocus, setIsFocus] = React.useState(false);

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
      <div
        className={styles['text-field-container']}
        onMouseOver={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
        onFocus={() => setIsFocus(true)}
        onBlur={() => setIsFocus(false)}
      >
        <input
          ref={ref}
          className={cn(global['field'], styles['text-field'], className, disabled && '!bg-gray-200 !text-gray-600')}
          value={value}
          disabled={disabled}
          onChange={onChange ? onFieldChangeEvent(onChange, localValue.current, pattern, beforeChange) : undefined}
          {...rest}
        />

        <div className="flex gap-1 absolute top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer z-10 ltr:right-0.5 rtl:left-0.5">
          {clearable && value !== undefined && value !== '' && !disabled && (
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

          {AppendComponent && <AppendComponent isFocus={isFocus} isHover={isHover} />}
        </div>
      </div>
    );
  }
);

Input.displayName = 'Input';

const TextField = forwardRef<HTMLInputElement, TextFieldProps>((props, ref) => {
  const { t } = useTranslation();
  const { className, onChange, name, label, rules, value = '', hideDetails, clearable = false, beforeChange, containerClass, loading, ...rest } = props;

  const placeholder = rest.placeholder ? t(rest.placeholder) : undefined;

  return (
    <InputWrapper className={cn(className)} name={name} label={label} rules={rules} hideDetails={hideDetails} value={value} onChange={onChange} loading={loading}>
      <Input
        ref={ref}
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
});

TextField.displayName = 'TextField';

export default TextField;
