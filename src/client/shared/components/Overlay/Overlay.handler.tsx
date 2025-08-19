// overlay-helper.ts
import type { OverlayProps, OverlayRef } from './Overlay.type';
import React, { type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import Overlay from './Overlay';

export const OverlayHandler = (props: Omit<OverlayProps, 'ref'>): OverlayRef & { create: (node: ReactNode, openFlag?: boolean) => Promise<void> } => {
  let ref: OverlayRef | null = null;
  const open: OverlayRef['open'] = () => ref?.open();
  const close: OverlayRef['close'] = () => ref?.close();
  const create = async (node: ReactNode, openFlag?: boolean): Promise<void> => {
    return await new Promise<void>((resolve) => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const root = createRoot(container);

      const cleanup = () => {
        root.unmount();
        container.remove();
      };

      const handleClose = async (...args: Array<any>) => {
        await props.closeCallback?.(...args);

        cleanup();
      };

      const handleOpen = async (node: ReactNode, ...args: Array<any>) => {
        await props.openCallback?.(...args);
      };

      const handleRef = (overlayRef: OverlayRef) => {
        if (overlayRef) {
          ref = overlayRef;

          if (openFlag) {
            ref.open();
          }
        }

        resolve();
      };

      root.render(
        <Overlay {...props} ref={handleRef} closeCallback={handleClose} openCallback={handleOpen}>
          {node}
        </Overlay>
      );
    });
  };

  return { create, open, close };
};
