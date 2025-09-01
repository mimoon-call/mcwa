import React, { useRef, useImperativeHandle, forwardRef, type PropsWithChildren, type FormEvent } from 'react';
import { cn } from '@client/plugins';
import type { FormProps, FormRef } from '@components/Form/Form.types';

const Form = forwardRef<FormRef, PropsWithChildren<FormProps>>((props, ref) => {
  const { className, children, onSubmit } = props;
  const formRef = useRef<HTMLFormElement | null>(null);

  const validate = () => {
    // Force validation on all InputWrapper components by triggering a custom validation event
    const inputWrappers = formRef.current?.querySelectorAll('[data-input-wrapper]');
    
    inputWrappers?.forEach((wrapper) => {
      // Trigger a custom validation event on the InputWrapper itself
      const validationEvent = new CustomEvent('forceValidation', { bubbles: true });
      wrapper.dispatchEvent(validationEvent);
    });

    // Check for errors immediately after triggering validation
    const error = formRef.current?.querySelector('[data-has-error="true"]');

    if (error) {
      formRef.current?.setAttribute('data-has-error', 'true');
      error?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    } else {
      formRef.current?.removeAttribute('data-has-error');
      return true;
    }
  };

  const submitHandler = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!validate()) {
      return;
    }

    onSubmit?.(event as unknown as FormEvent<HTMLFormElement>);
  };

  useImperativeHandle(ref, () => ({
    validate,
  }));

  return (
    <form ref={formRef} className={cn('flex flex-col', className)} onSubmit={submitHandler}>
      {children}
    </form>
  );
});

Form.displayName = 'Form';

export default Form;
