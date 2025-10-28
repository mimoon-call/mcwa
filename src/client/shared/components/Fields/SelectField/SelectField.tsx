// src/client/shared/components/Fields/SelectField/SelectField.tsx
import type { SelectFieldProps } from '@components/Fields/SelectField/SelectField.types';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import global from '@components/Fields/Fields.module.css';
import styles from '@components/Fields/SelectField/SelectField.module.css';
import { useTranslation } from 'react-i18next';
import Icon from '@components/Icon/Icon';
import { getLastZIndex } from '@helpers/get-last-z-index';
import type { ReactNode } from 'react';
import { cn } from '@client/plugins';

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
  const {
    className,
    onChange,
    name,
    label,
    rules,
    value,
    hideDetails,
    options,
    placeholder,
    clearable,
    searchable,
    disabled = false,
    loading,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, zIndex: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate dropdown position
  const calculateDropdownPosition = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 240; // max-h-60 = 240px

    // Check if there's enough space below
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top = rect.bottom + window.scrollY;

    // If not enough space below but more space above, position above
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      top = rect.top + window.scrollY - dropdownHeight;
    }

    setDropdownPosition({
      top,
      left: rect.left + window.scrollX,
      width: rect.width,
      zIndex: getLastZIndex(),
    });
  }, []);

  // Find selected option with more robust comparison
  const selectedOption = options.find((option) => {
    // Handle strict equality first
    if (option.value === value) return true;
    
    // Handle null/undefined cases
    if (value == null && option.value == null) return true;
    
    // Handle type coercion for primitive values
    if (typeof option.value === 'number' && typeof value === 'string') {
      return option.value === Number(value);
    }
    if (typeof option.value === 'string' && typeof value === 'number') {
      return String(option.value) === String(value);
    }
    if (typeof option.value === 'boolean' && typeof value === 'string') {
      return option.value === (value === 'true');
    }
    if (typeof option.value === 'string' && typeof value === 'boolean') {
      return String(option.value) === String(value);
    }
    
    return false;
  });
  
  
  
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
    [onChange, value]
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
          calculateDropdownPosition();
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
    [isOpen, filteredOptions, highlightedIndex, handleOptionSelect, searchable, calculateDropdownPosition]
  );

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setHighlightedIndex(-1);
  }, []);

  // Close dropdown when clicking outside and handle window resize
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };

    const handleResize = () => {
      if (isOpen) {
        calculateDropdownPosition();
      }
    };

    // Use click instead of mousedown to avoid timing issues
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
    };
  }, [isOpen, calculateDropdownPosition]);

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

  const placeholderText = placeholder ? t(placeholder) : '';

  return (
    <InputWrapper
      className={cn(className)}
      name={name}
      label={label}
      rules={rules}
      hideDetails={hideDetails}
      value={value}
      onChange={onChange}
      loading={loading}
    >
      <div ref={containerRef} className={cn(styles['select-container'])}>
        <div
          className={cn(global['field'], styles['select-field'], className, disabled && '!bg-gray-200 !text-gray-600 !cursor-not-allowed')}
          onClick={() => {
            if (!disabled) {
              if (!isOpen) {
                calculateDropdownPosition();
              }
              setIsOpen(!isOpen);
            }
          }}
          onKeyDown={handleKeyDown}
          tabIndex={disabled ? -1 : 0}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          data-has-error={Boolean(props.value === undefined && rules)}
        >
          <span className={cn(styles['select-field__value'], !displayValue && 'text-slate-400', 'truncate flex-1 min-w-0')}>
            {displayValue || placeholderText}
          </span>

          {clearable && value !== undefined && !disabled && (
            <Icon
              name="svg:x-mark"
              size="0.75rem"
              className="ms-2 text-slate-400 hover:text-slate-600 cursor-pointer flex-shrink-0"
              onClick={handleClear}
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
            />
          )}

          <Icon clickable name="svg:chevron-down" size="0.75rem" className={cn('ms-2 text-slate-400 flex-shrink-0', isOpen && 'rotate-180')} />
        </div>

        {isOpen &&
          createPortal(
            <div
              ref={dropdownRef}
              className={styles['select-dropdown']}
              role="listbox"
              style={{
                position: 'absolute',
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                zIndex: dropdownPosition.zIndex,
              }}
            >
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
                      selectedOption === option && styles['selected'],
                      index === highlightedIndex && styles['highlighted']
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOptionSelect(option.value);
                    }}
                    role="option"
                    aria-selected={selectedOption === option}
                  >
                    {option.title}
                  </div>
                ))
              ) : (
                <div className={styles['no-options']}>{t('GENERAL.NO_OPTIONS_FOUND')}</div>
              )}
            </div>,
            document.body
          )}
      </div>
    </InputWrapper>
  );
};

export default SelectField;
