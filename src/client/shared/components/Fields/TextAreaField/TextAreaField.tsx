// src/client/shared/components/TextAreaField/TextAreaField.tsx
import type { ClassValue } from 'clsx';
import type { InputWrapperProps } from '@components/Fields/InputWrapper/InputWrapper.types';
import React, { type HTMLAttributes, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import InputWrapper from '@components/Fields/InputWrapper/InputWrapper';
import global from '@components/Fields/Fields.module.css';
import styles from '@components/Fields/TextAreaField/TextAreaField.module.css';
import { cn } from '@client/plugins';
import { useTranslation } from 'react-i18next';

type TextAreaFieldProps = InputWrapperProps & {
  className?: ClassValue;
  rows?: number;
  placeholder?: string;
  fieldMaps?: Record<string, string>;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'pattern' | 'placeholder'>;

export type TextAreaFieldRef = {
  insertDynamicField: (title: string, value: string) => void;
  getSelection: () => { start: number; end: number; text: string };
  focus: () => void;
};

// Helper function to extract plain text from contentEditable div
const extractTextFromDiv = (div: HTMLDivElement): string => {
  let result = '';

  const walker = document.createTreeWalker(div, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && parent.getAttribute('data-non-editable') === 'true') return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (element.getAttribute('data-non-editable') === 'true') {
        const realText = element.getAttribute('data-real-text');

        if (realText) {
          result += realText;
        } else {
          result += element.textContent || '';
        }
      }
    }
  }

  return result;
};

// Helper function to create a non-editable span element
const createNonEditableSpan = (title: string, value: string): HTMLSpanElement => {
  const span = document.createElement('span');
  span.textContent = title;
  span.style.backgroundColor = '#e3f2fd';
  span.style.padding = '2px 4px';
  span.style.borderRadius = '3px';
  span.style.margin = '0 1px';
  span.style.userSelect = 'none';
  span.contentEditable = 'false';
  span.setAttribute('data-non-editable', 'true');
  span.setAttribute('data-real-text', value);
  span.setAttribute('data-title', title);
  return span;
};

// Helper function to set cursor position after inserted content
const setCursorAfterElement = (element: HTMLElement) => {
  const range = document.createRange();
  const selection = window.getSelection();

  range.setStartAfter(element);
  range.collapse(true);

  selection?.removeAllRanges();
  selection?.addRange(range);
};

const TextAreaField = forwardRef<TextAreaFieldRef, TextAreaFieldProps>((props, ref) => {
  const { t } = useTranslation();
  const { className, onChange, name, label, rules, value, rows = 4, fieldMaps, ...rest } = props;
  const placeholder = rest.placeholder ? t(rest.placeholder) : undefined;
  const divRef = useRef<HTMLDivElement>(null);

  // Handle content changes
  const handleInput = () => {
    const div = divRef.current;
    if (!div) return;

    const textValue = extractTextFromDiv(div);
    onChange?.(textValue);
  };

  // Handle paste events to insert regular editable text
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    
    const div = divRef.current;
    if (!div) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    
    // Insert as regular text node (editable)
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    
    // Set cursor after the inserted text
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Update the form state
    setTimeout(() => {
      const newTextValue = extractTextFromDiv(div);
      onChange?.(newTextValue);
    }, 0);
  };

  // Handle keydown events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle backspace/delete to remove entire non-editable spans
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const startContainer = range.startContainer;

      // Check if cursor is right after a non-editable span
      if (startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = startContainer as Text;
        const parent = textNode.parentNode;

        if (e.key === 'Backspace' && textNode.textContent === '' && parent) {
          const prevSibling = parent.previousSibling;
          if (prevSibling && (prevSibling as Element).getAttribute?.('data-non-editable')) {
            e.preventDefault();
            prevSibling.remove();
            handleInput();
            return;
          }
        }

        if (e.key === 'Delete' && textNode.textContent === '' && parent) {
          const nextSibling = parent.nextSibling;
          if (nextSibling && (nextSibling as Element).getAttribute?.('data-non-editable')) {
            e.preventDefault();
            nextSibling.remove();
            handleInput();
            return;
          }
        }
      }
    }
  };

  // Insert dynamic field with title and value
  const insertDynamicField = (title: string, value: string) => {
    const div = divRef.current;
    if (!div) return;

    div.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const span = createNonEditableSpan(title, value);
    range.insertNode(span);

    // Add a space after the span to separate it from following text
    const spaceNode = document.createTextNode(' ');
    range.setStartAfter(span);
    range.insertNode(spaceNode);

    setCursorAfterElement(span);

    // Update the form state by directly calling onChange
    // The setTimeout ensures it happens after the DOM update is complete
    setTimeout(() => {
      const newTextValue = extractTextFromDiv(div);
      onChange?.(newTextValue);
    }, 0);
  };

  useImperativeHandle(
    ref,
    () => ({
      insertDynamicField,

      getSelection: () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return { start: 0, end: 0, text: '' };
        }

        const range = selection.getRangeAt(0);
        const selectedText = range.toString();

        return { start: 0, end: selectedText.length, text: selectedText };
      },

      focus: () => {
        divRef.current?.focus();
      },
    }),
    []
  );

  // Update div content when value changes externally
  useEffect(() => {
    const div = divRef.current;
    if (!div || !value) return;

    const currentText = extractTextFromDiv(div);
    if (currentText !== value) {
      div.innerHTML = '';

      // Check if the value contains dynamic field patterns like {fieldName}
      const dynamicFieldRegex = /\{([^}]+)\}/g;
      const matches = Array.from(value.matchAll(dynamicFieldRegex));

      if (matches.length > 0) {
        // Split the text by dynamic field patterns and reconstruct with spans
        let lastIndex = 0;
        const nodes: Node[] = [];

        matches.forEach((match) => {
          const fullMatch = (match as RegExpMatchArray)[0]; // e.g., "{fullName}"
          const fieldName = (match as RegExpMatchArray)[1]; // e.g., "fullName"
          const matchIndex = (match as RegExpMatchArray).index!;

          // Add text before the match
          if (matchIndex > lastIndex) {
            const textBefore = value.substring(lastIndex, matchIndex);
            if (textBefore) {
              nodes.push(document.createTextNode(textBefore));
            }
          }

          // Create span for the dynamic field
          // Use fieldMaps to get the title, fallback to fieldName (without braces) if not found
          const title = fieldMaps?.[fieldName] || fieldName;
          const span = createNonEditableSpan(title, fullMatch);
          nodes.push(span);

          lastIndex = matchIndex + fullMatch.length;
        });

        // Add remaining text after the last match
        if (lastIndex < value.length) {
          const remainingText = value.substring(lastIndex);
          if (remainingText) {
            nodes.push(document.createTextNode(remainingText));
          }
        }

        // Append all nodes to the div
        nodes.forEach((node) => div.appendChild(node));
      } else {
        // No dynamic fields, just set the text content
        div.textContent = value;
      }
    }
  }, [value, fieldMaps]);

  const minHeight = rows * 1.5; // Approximate line height
  const maxHeight = rows * 1.5; // Set max height to same as min height to prevent expansion

  return (
    <InputWrapper className={cn(className)} name={name} label={label} rules={rules} value={value} onChange={onChange}>
      <div
        ref={divRef}
        contentEditable
        className={cn(global['field'], styles['text-area'], 'min-h-0 resize-none overflow-auto', className)}
        style={{ minHeight: `${minHeight}rem`, maxHeight: `${maxHeight}rem`, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
        placeholder={placeholder}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        suppressContentEditableWarning={true}
        {...rest}
      />
    </InputWrapper>
  );
});

TextAreaField.displayName = 'TextAreaField';

export default TextAreaField;
