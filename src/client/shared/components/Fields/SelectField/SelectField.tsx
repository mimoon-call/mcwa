// src/client/shared/components/Fields/SelectField/SelectField.tsx
import type { SelectFieldProps } from '@components/Fields/SelectField/SelectField.types';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import global from '@components/Fields/Fields.module.css';
import styles from '@components/Fields/SelectField/SelectField.module.css';
import { cn } from '@client/plugins';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';
import type { ReactNode } from 'react';

// Helper function to extract text content from ReactNode
const extractTextFromReactNode = (node: ReactNode): string => {
  if (node === null || node === undefined) {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).trim();
  }

  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: ReactNode }>;
    if (element.props.children) {
      if (Array.isArray(element.props.children)) {
        return element.props.children
          .map(extractTextFromReactNode)
          .filter((text) => text.length > 0)
          .join(' ');
      }
      return extractTextFromReactNode(element.props.children);
    }
  }

  return '';
};

const SelectField = <T = unknown,>(props: SelectFieldProps<T>) => {
  const { t } = useTranslation();
  const { className, onChange, name, label, rules, value, hideDetails, options, placeholder, clearable, searchable = true, disabled = false } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find selected option
  const selectedOption = options.find((option) => option.value === value);
  const displayValue = selectedOption ? selectedOption.title : '';

  // Filter options based on search term
  const filteredOptions =
    searchable && searchTerm
      ? options.filter((option) => {
          const text = typeof option.title === 'string' ? option.title : extractTextFromReactNode(option.title);
          return text.toLowerCase().includes(searchTerm.toLowerCase());
        })
      : options;

  // Handle option selection
  const handleOptionSelect = useCallback(
    (optionValue: T) => {
      onChange?.(optionValue);
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  // Handle clear selection
  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.(undefined);
      setSearchTerm('');
    },
    [onChange]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
          if (searchable && searchInputRef.current) searchInputRef.current.focus();
        }

        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
            handleOptionSelect(filteredOptions[highlightedIndex].value);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setSearchTerm('');
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, filteredOptions, highlightedIndex, handleOptionSelect, searchable]
  );

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setHighlightedIndex(-1);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const optionElement = dropdownRef.current.children[highlightedIndex] as HTMLElement;
      if (optionElement) {
        optionElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const placeholderText = placeholder ? t(placeholder) : t('GENERAL.SELECT_AN_OPTION');

  return (
    <InputWrapper className={cn(className)} name={name} label={label} rules={rules} hideDetails={hideDetails} value={value} onChange={onChange}>
      <div ref={containerRef} className={cn(styles['select-container'])}>
        <div
          className={cn(global['field'], styles['select-field'], className, disabled && '!bg-gray-200 !text-gray-600 !cursor-not-allowed')}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          tabIndex={disabled ? -1 : 0}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          data-has-error={Boolean(props.value === undefined && rules)}
        >
          <span className={cn(!displayValue && 'text-slate-400', 'truncate flex-1 min-w-0')}>{displayValue || placeholderText}</span>

          {clearable && value && !disabled && (
            <Icon
              name="svg:x-mark"
              size="0.875rem"
              className="ms-2 text-slate-400 hover:text-slate-600 cursor-pointer flex-shrink-0"
              onClick={handleClear}
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
            />
          )}

          <Icon clickable name="svg:chevron-down" size="0.875rem" className={cn('ms-2 text-slate-400 flex-shrink-0', isOpen && 'rotate-180')} />
        </div>

        {isOpen && (
          <div ref={dropdownRef} className={styles['select-dropdown']} role="listbox">
            {searchable && (
              <input
                ref={searchInputRef}
                type="text"
                className={styles['select-search']}
                placeholder={t('GENERAL.SEARCH_PLACEHOLDER')}
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
              />
            )}

            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <div
                  key={String(option.value)}
                  className={cn(
                    styles['select-option'],
                    option.value === value && styles['selected'],
                    index === highlightedIndex && styles['highlighted']
                  )}
                  onClick={() => handleOptionSelect(option.value)}
                  role="option"
                  aria-selected={option.value === value}
                >
                  {option.title}
                </div>
              ))
            ) : (
              <div className={styles['no-options']}>{t('GENERAL.NO_OPTIONS_FOUND')}</div>
            )}
          </div>
        )}
      </div>
    </InputWrapper>
  );
};

export default SelectField;
