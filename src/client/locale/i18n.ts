// src/client/locale/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@client/locale/en.json';
import he from '@client/locale/he.json';
import '@client/locale/dayjs';

const jsons = { en, he };
const resources: Record<string, { translation: typeof en }> = Object.entries(jsons).reduce((acc, [key, value]) => {
  return { ...acc, [key]: { translation: value } };
}, {});

// Get saved language from localStorage or use default
const savedLanguage = typeof window !== 'undefined' ? localStorage.getItem('language') : null;
const defaultLanguage = savedLanguage || Object.keys(jsons)[0];

i18n.use(initReactI18next).init({
  fallbackLng: Object.keys(jsons)[0],
  lng: defaultLanguage,
  resources,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// Save language to localStorage when it changes and dispatch global event
i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('language', lng);
    // Dispatch custom event for dayjs to listen to
    window.dispatchEvent(new CustomEvent('i18n:languageChanged', { detail: { lng } }));
  }
});

export default i18n;
