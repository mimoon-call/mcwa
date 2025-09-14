// src/client/router/index.tsx
import React from 'react';
import type { RouteObject } from 'react-router-dom';
import Instance from '@client/pages/Instance/Instance';
import Home from '@client/pages/Home/Home';
import Queue from '@client/pages/Queue/Queue';
import Chat from '@client/pages/Chat/Chat';
import { RouteName } from '@client/router/route-name';

const router: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: `/${RouteName.queue}`, element: <Queue /> },
  { path: `/${RouteName.instance}/:phoneNumber?/:withPhoneNumber?`, element: <Instance /> },
  { path: `/${RouteName.chat}/:instanceNumber?/:phoneNumber?`, element: <Chat /> },
];

export default router;
