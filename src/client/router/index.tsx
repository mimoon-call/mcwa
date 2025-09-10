// src/client/router/index.tsx
import React from 'react';
import type { RouteObject } from 'react-router-dom';
import Instance from '@client/pages/Instance/Instance';
import Home from '@client/pages/Home/Home';
import Queue from '@client/pages/Queue/Queue';
import Chat from '@client/pages/Chat/Chat';

const router: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/queue', element: <Queue /> },
  { path: '/instance/:phoneNumber?/:withPhoneNumber?', element: <Instance /> },
  { path: '/chat/:instanceNumber?/:phoneNumber?', element: <Chat /> },
];

export default router;
