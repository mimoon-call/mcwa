// src/client/shared/components/InputWrapper/InputWrapper.tsx
import type { InputWrapperProps } from '@components/Fields/InputWrapper/InputWrapper.types';
import React, { type FC, type PropsWithChildren, type ReactElement, isValidElement, cloneElement, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import FieldValidator from '@services/field-validator/field-validator.service';
import { cn } from '@client/plugins';
import { useTooltip } from '@hooks/useTooltip';

const InputWrapper: FC<PropsWithChildren<InputWrapperProps>> = (props) => {
  const { t } = useTranslation();
  const { className, children, label, debounce } = props;

  const isInit = useRef(true);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTouch, setTouch] = useState(false);

  const validate = (newValue: InputWrapperProps['value']) => {
    if (!props.rules) {
      setError(null);
      return null;
    }

    const validator = new FieldValidator([props.rules]);
    const result = validator.validate(newValue);
    setError(result?.message ? t(result.message, result) : null);
  };

  const onChange = (newValue: InputWrapperProps['value']) => {
    validate(newValue);
    props.onChange?.(newValue);
  };

  const controlledChild = isValidElement(children)
    ? cloneElement(children as ReactElement<any>, {
        value: props.value,
        id: props.name,
        onChange,
        ['data-has-error']: Boolean(error) && !isTyping,
      })
    : children;

  useEffect(() => {
    if (isInit.current) {
      isInit.current = false;
      validate(props.rules);

      return;
    }

    setTouch(true);
    setIsTyping(true);

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      setIsTyping(false);
      validate(props.value);
    }, debounce || 0);
  }, [props.value]);

  const errorRef = useTooltip<HTMLDivElement>({ style: { color: 'red' } });

  return (
    <div className={cn('flex flex-col', className)}>
      <label
        className={cn(
          'flex flex-col text-slate-600 text-base mb-1 font-medium form-error:text-red-700',
          (isTouch || !onChange) && 'error:text-red-700'
        )}
      >
        <p className="ps-1">{typeof label === 'string' ? t(label) : label}</p>
        {controlledChild}
      </label>

      <div
        ref={errorRef}
        className={cn(
          { 'opacity-0': !error || (!isTouch && onChange) },
          'w-full ps-1 text-red-700 text-sm h-4 duration-200 error:opacity-100 mb-0.5 -mt-1 text-ellipsis overflow-hidden whitespace-nowrap form-error:opacity-100'
        )}
        role="alert"
      >
        {!isTyping && error}
      </div>
    </div>
  );
};

export default InputWrapper;
