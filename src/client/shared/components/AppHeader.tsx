import type { AppDispatch, RootState } from '@client/store';
import React, { type ReactNode } from 'react';
import { IS_AUTHENTICATED } from '@client/store/auth.constants';
import { useDispatch, useSelector } from 'react-redux';
import { StoreEnum } from '@client/store/store.enum';
import { LOGOUT } from '@client/store/auth.constants';
import authSlice from '@client/store/auth.slice';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Button from '@components/Button/Button';
import LanguageSwitcher from '@components/LanguageSwitcher/LanguageSwitcher';
// @ts-ignore
import mimoonCallLogo from '@client/assets/mimoon-call-logo.png';

interface NavWrapperProps {
  headerSlot?: ReactNode;
  actionsSlot?: ReactNode;
}

export default function AppHeader({ headerSlot, actionsSlot }: NavWrapperProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { [IS_AUTHENTICATED]: isAuthenticated } = useSelector((state: RootState) => state[StoreEnum.auth]);
  const { [LOGOUT]: logout } = authSlice;

  const handleLogout = () => {
    dispatch(logout());
  };

  const handleLogoClick = () => {
    navigate('/');
  };

  return (
    <nav className="flex gap-4 justify-between bg-primary">
      <div className="text-secondary flex gap-4 cursor-pointer hover:opacity-80 transition-opacity" onClick={handleLogoClick}>
        <img src={mimoonCallLogo} alt="Mimoon Call Logo" className="h-10 w-auto" />
        {headerSlot ? <div className="flex gap-2">{headerSlot}</div> : null}
      </div>
      <div className="text-secondary flex gap-2 items-center">
        {actionsSlot}
        <LanguageSwitcher />
        {isAuthenticated ? (
          <Button className="text-secondary" buttonType="flat" onClick={handleLogout}>
            {t('GENERAL.LOGOUT')}
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
