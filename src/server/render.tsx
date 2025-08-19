// src/server/render.tsx
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import '@client/locale/i18n';
import { createStore, type RootState } from '@client/store';
import { StoreEnum } from '@client/store/store.enum';

export function renderAppHtml(url: string, authState?: Partial<RootState[StoreEnum.AUTH]>): string {
  const store = createStore(authState);

  // Return a simple loading state for SSR to avoid hydration issues
  return renderToString(
    <Provider store={store}>
      <div id="app-loading" className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    </Provider>
  );
}
