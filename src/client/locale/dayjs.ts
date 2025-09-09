// src/client/locale/dayjs.ts
import dayjs from 'dayjs';
import 'dayjs/locale/he';
import 'dayjs/locale/en';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

// Extend dayjs with plugins
dayjs.extend(relativeTime);
dayjs.extend(duration);

// Set up dayjs locales
dayjs.locale('en');
dayjs.locale('he');

// Function to set dayjs locale based on current language
export const setDayjsLocale = (language: string) => {
  dayjs.locale(language);
};

// Listen for language changes globally
if (typeof window !== 'undefined') {
  // Listen for i18n language changes
  const handleLanguageChange = (lng: string) => {
    setDayjsLocale(lng);
  };

  // Set up global listener for i18n language changes
  window.addEventListener('i18n:languageChanged', ((event: CustomEvent) => {
    handleLanguageChange(event.detail.lng);
  }) as EventListener);

  // Also listen for storage changes (when language is changed in another tab)
  window.addEventListener('storage', (event) => {
    if (event.key === 'language' && event.newValue) {
      handleLanguageChange(event.newValue);
    }
  });

  // Set initial language from localStorage if available
  const savedLanguage = localStorage.getItem('language');
  if (savedLanguage) {
    setDayjsLocale(savedLanguage);
  }
}

// Export dayjs instance
export default dayjs;
