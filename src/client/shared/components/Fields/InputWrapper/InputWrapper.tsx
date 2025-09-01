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
  const [touched, setTouched] = useState(false);

  const validate = (newValue: InputWrapperProps['value'], forceValidate = false) => {
    // Only validate if validateAlways is true, or if the field has been touched, or if no onChange is provided, or if force validation is requested
    if (!touched && props.onChange !== undefined && !forceValidate) {
      return null;
    }

    if (!props.rules) {
      setError(null);
      return null;
    }

    const validator = new FieldValidator([props.rules]);
    const result = validator.validate(newValue);
    const errorMessage = result?.message ? t(result.message, result) : null;
    setError(errorMessage);

    // Immediately update the DOM attribute to ensure Form validation can find it
    const wrapper = document.querySelector(`[data-input-wrapper="${props.name}"]`);
    if (wrapper) {
      if (errorMessage) {
        wrapper.setAttribute('data-has-error', 'true');
      } else {
        wrapper.removeAttribute('data-has-error');
      }
    }

    // Also update the input element's data-has-error attribute for CSS styling
    const input = wrapper?.querySelector('input, textarea, select');
    if (input) {
      if (errorMessage) {
        input.setAttribute('data-has-error', 'true');
      } else {
        input.removeAttribute('data-has-error');
      }
    }
  };

  const onChange = (newValue: InputWrapperProps['value']) => {
    setTouched(true);
    validate(newValue);
    props.onChange?.(newValue);
  };

  const controlledChild = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          value?: InputWrapperProps['value'];
          id?: string;
          onChange?: (v: InputWrapperProps['value']) => void;
          'data-has-error'?: boolean;
        }>,
        {
          value: props.value,
          id: props.name,
          onChange,
          ['data-has-error']: Boolean(error),
        }
      )
    : children;

  useEffect(() => {
    if (isInit.current) {
      isInit.current = false;
      return;
    }

    setIsTyping(true);

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      setIsTyping(false);
      validate(props.value);
    }, debounce || 0);
  }, [props.value]);

  // Listen for force validation events from Form component
  useEffect(() => {
    const handleForceValidation = () => {
      setTouched(true); // Mark as touched when force validation is triggered
      validate(props.value, true); // Force validation regardless of touched state
    };

    const wrapper = document.querySelector(`[data-input-wrapper="${props.name}"]`);
    wrapper?.addEventListener('forceValidation', handleForceValidation);

    return () => {
      wrapper?.removeEventListener('forceValidation', handleForceValidation);
    };
  }, [props.name, props.value]);

  // Monitor value changes and trigger validation when onChange is undefined
  useEffect(() => {
    if (!props.onChange && props.rules && props.value !== undefined) {
      // Force validation on every value change when no onChange handler is provided
      validate(props.value);
    }
  }, [props.value, props.rules, props.onChange]);

  const errorRef = useTooltip<HTMLDivElement>({ style: { color: 'red' } });

  const content = label ? (
    <label className={cn('flex flex-col text-slate-600 text-base mb-1 font-medium', Boolean(error) && 'text-red-700')}>
      <p className="ps-1">{typeof label === 'string' ? t(label) : label}</p>
      {controlledChild}
    </label>
  ) : (
    controlledChild
  );

  return (
    <div className={cn('flex flex-col', className)} data-input-wrapper={props.name} data-has-error={Boolean(error)}>
      {content}

      <div
        ref={errorRef}
        className={cn(
          { 'opacity-0': !error },
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
