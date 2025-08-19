import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@client/locale/i18n';
import dayjs from '@client/locale/dayjs';

export const useLanguage = () => {
  const { i18n: i18nInstance } = useTranslation();

  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
  };

  const isRTL = i18nInstance.language === 'he';

  useEffect(() => {
    // Update document direction based on language
    document.body.dir = isRTL ? 'rtl' : 'ltr';
    document.body.lang = i18nInstance.language;

    // Update dayjs locale
    dayjs.locale(i18nInstance.language);
  }, [i18nInstance.language, isRTL]);

  return {
    currentLanguage: i18nInstance.language,
    changeLanguage,
    isRTL,
    t: i18nInstance.t,
  };
};
