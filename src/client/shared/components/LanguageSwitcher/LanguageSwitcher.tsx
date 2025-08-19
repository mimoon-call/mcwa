import React from 'react';
import { useLanguage } from '@hooks';
import { Menu } from '@components/Menu/Menu';
import Icon from '@components/Icon/Icon';

export default function LanguageSwitcher() {
  const { changeLanguage } = useLanguage();

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'he', name: 'עברית' },
  ];

  const handleLanguageChange = (languageCode: string) => {
    changeLanguage(languageCode);
  };

  return (
    <Menu
      activator={<Icon name="svg:globe" size="1.5rem" />}
      className="text-primary"
      items={languages.map(({ code, name }) => {
        return { label: <div className="hover:underline px-1 py-0.5">{name}</div>, onClick: () => handleLanguageChange(code) };
      })}
    />
  );
}
