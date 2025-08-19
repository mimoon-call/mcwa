// src/client/shared/components/Fields/Fields.helpers.ts
import type { ChangeEvent } from 'react';

export const onFieldChangeEvent = (onChangeCallback: (v: string) => void, currentValue: string, pattern?: RegExp | string) => {
  return (ev: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const newValue = ev.target.value;

    if (!pattern) {
      onChangeCallback(newValue);

      return;
    }

    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    if (!regex.test(newValue)) {
      ev.target.value = currentValue;
      return;
    }

    onChangeCallback(newValue);
  };
};
