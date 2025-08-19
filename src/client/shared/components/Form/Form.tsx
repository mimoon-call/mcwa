import React, { useRef, useImperativeHandle, forwardRef, type PropsWithChildren, type FormEvent } from 'react';
import { cn } from '@client/plugins';
import type { FormProps, FormRef } from '@components/Form/Form.types';

const Form = forwardRef<FormRef, PropsWithChildren<FormProps>>((props, ref) => {
  const { className, children, onSubmit } = props;
  const formRef = useRef<HTMLFormElement | null>(null);

  const validate = () => {
    const error = formRef.current?.querySelector('[data-has-error="true"]');

    if (error) {
      formRef.current?.setAttribute('data-has-error', 'true');
      error?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      formRef.current?.removeAttribute('data-has-error');
    }

    return !error;
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
