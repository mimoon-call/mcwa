import type { FormEventHandler, FormHTMLAttributes } from 'react';
import type { ClassValue } from 'clsx';

export type FormProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'className'> & {
  className?: ClassValue;
  onSubmit?: FormEventHandler<HTMLFormElement>;
};

export type FormRef = {
  validate: () => boolean;
};
