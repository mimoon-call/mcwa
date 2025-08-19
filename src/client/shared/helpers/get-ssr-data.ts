export const getSsrData = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const data = window.__SSR_DATA__;
  delete window.__SSR_DATA__;
  window.document.querySelector('#ssr-data')?.remove();

  return data;
};
