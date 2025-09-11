import type { AppDispatch, RootState } from './store';
import React, { useEffect, useCallback } from 'react';
import { useRoutes } from 'react-router-dom';
import router from '@client/router';
import LoginForm from '@client/pages/Login/LoginForm';
import { useDispatch, useSelector } from 'react-redux';
import authSlice from '@client/store/auth.slice';
import globalSlice from '@client/store/global.slice';
import { REFRESH_TOKEN } from '@server/api/auth/auth.map';
import { IS_AUTHENTICATED, SET_AUTH_STATE } from '@client/store/auth.constants';
import { StoreEnum } from '@client/store/store.enum';
import '@client/shared/prototype';
import { TinyEmitter } from 'tiny-emitter';
import { EscapeService } from '@services/escape-service';
import getClientSocket from '@client/shared/helpers/get-client-socket.helper';
import { InstanceEventEnum } from '@client/pages/Instance/constants/instance-event.enum';
import type { InstanceStateData } from '@client/store/global.types';

export const emitter = new TinyEmitter();
export const esc = new EscapeService();

export default function App({ data }: { data?: Record<string, unknown> }) {
  const component = useRoutes(router);
  const dispatch = useDispatch<AppDispatch>();
  const { [REFRESH_TOKEN]: refreshToken } = authSlice;
  const { [IS_AUTHENTICATED]: isAuthenticated } = useSelector((state: RootState) => state[StoreEnum.auth]);

  const handleAuthAndRefresh = useCallback(() => {
    if (data?.[StoreEnum.auth]) {
      dispatch(authSlice[SET_AUTH_STATE](data[StoreEnum.auth]));
    }

    dispatch(refreshToken());
  }, [data, dispatch]);

  useEffect(() => {
    handleAuthAndRefresh();
  }, [handleAuthAndRefresh]);

  // Socket watcher for InstanceEventEnum.INSTANCE_READY and update global state (activeList, readyCount, totalCount)
  useEffect(() => {
    const socket = getClientSocket();

    if (!socket) return;

    const handleInstanceReady = (data: InstanceStateData) => {
      dispatch(globalSlice.updateInstanceState(data));
    };

    socket.on(InstanceEventEnum.INSTANCE_READY, handleInstanceReady);

    return () => {
      socket.off(InstanceEventEnum.INSTANCE_READY, handleInstanceReady);
    };
  }, [dispatch]);

  return !isAuthenticated ? <LoginForm /> : component;
}
