export const getLastZIndex = (selector: string = '*'): number => {
  if (typeof document === 'undefined') {
    return Date.now();
  }

  const elements = document.querySelectorAll(selector);

  const zIndexes = Array.from(elements).map((el) => {
    const zIndex = window.getComputedStyle(el).getPropertyValue('z-index');

    return isNaN(parseInt(zIndex)) ? 0 : parseInt(zIndex);
  });

  return Math.max(...zIndexes) + 1;
};
