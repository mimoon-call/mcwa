// src/client/main.tsx
import React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getSsrData } from '@helpers/get-ssr-data';
import App from '@client/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App data={getSsrData()} />
  </StrictMode>
);
