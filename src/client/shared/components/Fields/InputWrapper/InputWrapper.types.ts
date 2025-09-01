import type { ClassValue } from 'clsx';
import type { ValidatorFieldRules } from '@services/field-validator/field-validator.type';
import type { ReactNode } from 'react';

type Value = any | Record<string, any> | unknown[];

export type InputWrapperProps = {
  name: string;
  className?: ClassValue;
  value?: Value;
  label?: string | ReactNode;
  rules?: ValidatorFieldRules;
  pattern?: RegExp | string;
  debounce?: number;
  onChange?: (v: Value) => void;
};
