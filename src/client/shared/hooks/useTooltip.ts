// src/client/shared/hooks/useTooltip.ts
import { type CSSProperties, type RefObject, useEffect } from 'react';
import { getLastZIndex } from '@helpers/get-last-z-index';

const WIDTH_LIMIT = 300;

type TooltipOptions = {
  text?: string;
  color?: string;
  isAlwaysOn?: boolean;
  timeout?: number;
  style?: CSSProperties;
};

const getFormattedText = (element: HTMLElement): string => {
  let text = '';

  const traverse = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue?.trim() || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const computedStyle = window.getComputedStyle(node as HTMLElement);
      const isBlock = computedStyle.display === 'block';
      if (isBlock && text.trim()) text += '\n';
      else text += ' ';
      node.childNodes.forEach(traverse);
      if (isBlock) text += '\n';
    }
  };
  traverse(element);
  return text.trim().replace(/\n\s*\n/g, '\n');
};

const setTooltipProps = (event: MouseEvent, tooltipEl: HTMLElement, color: string, text?: string, style?: CSSProperties) => {
  const targetEl = event.target as HTMLElement;
  const computedStyle = window.getComputedStyle(targetEl);
  const direction = computedStyle.getPropertyValue('direction');
  const isRtl = direction === 'rtl';

  tooltipEl.innerHTML = text || getFormattedText(targetEl);
  tooltipEl.style.visibility = 'hidden';
  tooltipEl.style.position = 'absolute';
  tooltipEl.style.top = '0px';
  tooltipEl.style.left = '0px';
  document.body.appendChild(tooltipEl);

  requestAnimationFrame(() => {
    const targetRect = targetEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const elWidth = Math.min(tooltipRect.width, WIDTH_LIMIT);
    const elHeight = tooltipRect.height;

    let top = targetRect.bottom + 10;
    let left = event.clientX + (isRtl ? -(elWidth - 32) : 32);

    left = Math.max(10, Math.min(left, window.innerWidth - elWidth - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - elHeight - 10));

    Object.assign(tooltipEl.style, {
      top: `${top}px`,
      left: `${left}px`,
      visibility: 'visible',
      position: 'fixed',
      zIndex: getLastZIndex(),
      backgroundColor: 'white',
      boxShadow: '0 2px 8px rgba(186, 199, 220, 0.7)',
      padding: '0.25rem 0.5rem',
      borderRadius: '0.5rem',
      color: color || 'var(--color-primary)',
      whiteSpace: 'pre-wrap',
      maxWidth: `${WIDTH_LIMIT}px`,
      wordWrap: 'break-word',
      ...(style || {}),
    });

    tooltipEl.setAttribute('tooltip', tooltipEl.innerText);
  });
};

export function useTooltip(ref: RefObject<HTMLElement | null>, options: TooltipOptions = {}) {
  if (typeof window === 'undefined') {
    return;
  }

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(hover: hover)').matches) {
      return;
    }

    const { text, color = 'var(--color-primary)', isAlwaysOn = false, timeout = 100, style = {} } = options;

    if (!(el.offsetWidth < el.scrollWidth || text || isAlwaysOn)) {
      return;
    }

    const tooltipEl = document.createElement('div');
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const showTooltip = (event: MouseEvent) => {
      document.querySelectorAll('[tooltip]').forEach((el) => el.remove());
      clearTimeout(timeoutId!);

      timeoutId = setTimeout(() => {
        if (getComputedStyle(el as HTMLElement).opacity === '0') {
          return;
        }

        setTooltipProps(event, tooltipEl, color, text, style);
        document.body.appendChild(tooltipEl);
      }, timeout);
    };

    const hideTooltip = () => {
      if (getComputedStyle(el as HTMLElement).opacity === '0') {
        document.body.removeChild(tooltipEl);

        return;
      }

      setTimeout(() => {
        if (tooltipEl && document.body.contains(tooltipEl)) {
          document.body.removeChild(tooltipEl);
        }
      }, 300);
    };

    el.addEventListener('mouseenter', showTooltip);
    el.addEventListener('mouseleave', hideTooltip);

    return () => {
      clearTimeout(timeoutId!);
      el.removeEventListener('mouseenter', showTooltip);
      el.removeEventListener('mouseleave', hideTooltip);
      if (document.body.contains(tooltipEl)) {
        document.body.removeChild(tooltipEl);
      }
    };
  }, [ref, options]);
}
