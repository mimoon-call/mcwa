// src/client/index.tsx
import '@client/locale/i18n';
import '@client/styles/tailwind.css';
import App from '@client/App';
import React from 'react';
import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import { getSsrData } from '@helpers/get-ssr-data';
import { BrowserRouter } from 'react-router-dom';
import AppHeader from '@components/AppHeader';
import { createStore } from '@client/store';
import AppFooter from '@components/AppFooter';
import { NextWarmCountdown } from '@client/components/NextWarmCountdown';
import MessageQueueCounter from '@client/components/MessageQueueCounter';

export let store: ReturnType<typeof createStore>;

(async () => {
  store = createStore({});
  window.document.querySelector('#preloader')?.remove();

  // Use createRoot instead of hydrateRoot to avoid hydration issues
  const root = createRoot(document.getElementById('root')!);

  root.render(
    <Provider store={store}>
      <AppHeader />

      <main>
        <BrowserRouter>
          <App data={getSsrData()} />
        </BrowserRouter>
      </main>

      <AppFooter>
        <div className="flex align-middle text-sm w-full justify-end">
          <NextWarmCountdown className="border-s" />
          <MessageQueueCounter className="border-s" />
        </div>
      </AppFooter>
    </Provider>
  );
})();
