// src/client/router/index.tsx
import React from 'react';
import type { RouteObject } from 'react-router-dom';
import Instance from '@client/pages/Instance/Instance';
import Home from '@client/pages/Home/Home';
import MessageQueue from '@client/pages/MessageQueue/MessageQueue';

const router: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/queue', element: <MessageQueue /> },
  { path: '/instance/:phoneNumber?', element: <Instance /> },
];

export default router;
