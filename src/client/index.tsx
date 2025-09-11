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
import InstanceCounter from '@client/components/InstanceCounter';

export let store: ReturnType<typeof createStore>;

(async () => {
  store = createStore({});
  window.document.querySelector('#preloader')?.remove();

  // Use createRoot instead of hydrateRoot to avoid hydration issues
  const root = createRoot(document.getElementById('root')!);

  root.render(
    <Provider store={store}>
      <BrowserRouter>
        <AppHeader />
        <main>
          <App data={getSsrData()} />
        </main>
        <AppFooter>
          <div className="flex align-middle text-sm w-full justify-end">
            <MessageQueueCounter className="border-s" />
            <NextWarmCountdown className="border-s" />
            <InstanceCounter className="border-s" />
          </div>
        </AppFooter>
      </BrowserRouter>
    </Provider>
  );
})();
