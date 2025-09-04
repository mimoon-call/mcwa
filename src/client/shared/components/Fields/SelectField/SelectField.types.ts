import type { ClassValue } from 'clsx';
import type { InputWrapperProps } from '@components/Fields/InputWrapper/InputWrapper.types';
import type { Option } from '@client/shared/models/options';

export type SelectFieldProps<T = unknown> = InputWrapperProps & {
  className?: ClassValue;
  options: Option<T>[];
  placeholder?: string;
  searchable?: boolean;
  clearable?: boolean;
  disabled?: boolean;
};
