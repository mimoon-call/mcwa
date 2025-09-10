import type { AppDispatch, RootState } from './store';
import React, { useEffect } from 'react';
import { useNavigate, useRoutes } from 'react-router-dom';
import router from '@client/router';
import LoginForm from '@client/pages/Login/LoginForm';
import { useDispatch, useSelector } from 'react-redux';
import authSlice from '@client/store/auth.slice';
import { REFRESH_TOKEN } from '@server/api/auth/auth.map';
import { IS_AUTHENTICATED, SET_AUTH_STATE } from '@client/store/auth.constants';
import { StoreEnum } from '@client/store/store.enum';
import '@client/shared/prototype';
import { TinyEmitter } from 'tiny-emitter';
import { EscapeService } from '@services/escape-service';
import Tabs from '@components/Tabs/Tabs';
import type { TabItem } from '@components/Tabs/Tabs.type';

export const emitter = new TinyEmitter();
export const esc = new EscapeService();

export default function App({ data }: { data?: Record<string, unknown> }) {
  const component = useRoutes(router);
  const dispatch = useDispatch<AppDispatch>();
  const { [REFRESH_TOKEN]: refreshToken } = authSlice;
  const { [IS_AUTHENTICATED]: isAuthenticated } = useSelector((state: RootState) => state[StoreEnum.auth]);
  const navigate = useNavigate();

  useEffect(() => {
    if (data?.[StoreEnum.auth]) {
      dispatch(authSlice[SET_AUTH_STATE](data[StoreEnum.auth]));
    }

    dispatch(refreshToken());
  }, [data, dispatch]);

  const tabs: TabItem[] = [
    { label: 'INSTANCE.TITLE', component, onClick: () => navigate('/instance') },
    { label: 'QUEUE.TITLE', component, onClick: () => navigate('/queue') },
    { label: 'CHAT.TITLE', component, onClick: () => navigate('/chat') },
  ];

  return !isAuthenticated ? <LoginForm /> : <Tabs items={tabs} />;
}
