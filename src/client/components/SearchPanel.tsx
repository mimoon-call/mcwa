import type { FormRef } from '@components/Form/Form.types';
import type { ClassValue } from 'clsx';
import Button from '@components/Button/Button';
import React, { useRef, useEffect, Children, isValidElement } from 'react';
import { useTranslation } from 'react-i18next';
import Form from '@components/Form/Form';
import { cn } from '@client/plugins';

type SearchPanelProps = {
  onSearch: () => Promise<unknown> | unknown;
  onClear: () => Promise<unknown> | unknown;
  children: React.ReactNode;
  className?: ClassValue;
  fieldClass?: ClassValue;
} & ({ debounce: number; payload: unknown } | { debounce?: never; payload?: unknown });

export const SearchPanel = ({ onSearch, onClear, debounce = 500, children, payload, className, fieldClass }: SearchPanelProps) => {
  const { t } = useTranslation();

  const timeoutRef = useRef<NodeJS.Timeout>(undefined);
  const formRef = useRef<FormRef>(null);
  const isInitialMount = useRef(true);

  const search = () => {
    clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(
      () => {
        if (formRef.current?.validate()) onSearch();
      },
      payload ? debounce : 0
    );
  };

  // Watch payload changes and trigger search automatically
  useEffect(() => {
    // Skip auto-search on initial mount to prevent duplicate calls
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (payload !== undefined) {
      search();
    }
  }, [payload]); // Remove debounce from dependencies

  const enhancedChildren = fieldClass
    ? Children.map(children, (child) => {
        if (isValidElement(child)) {
          const existingClassName = (child.props as { className?: ClassValue })?.className;

          return React.cloneElement(child, { className: cn(fieldClass, existingClassName) } as Record<string, unknown>);
        }
        return child;
      })
    : children;

  return (
    <Form ref={formRef} className="p-4 bg-gray-50 m-2 rounded shadow">
      <div className="flex justify-between">
        <div className={cn('flex-grow flex flex-wrap gap-4', className)}>{enhancedChildren}</div>

        <div className="flex gap-2 items-end">
          {payload === undefined && (
            <Button buttonType="flat" onClick={search}>
              {t('GENERAL.SEARCH')}
            </Button>
          )}

          <Button buttonType="flat" onClick={onClear}>
            {t('GENERAL.CLEAR')}
          </Button>
        </div>
      </div>
    </Form>
  );
};
