// src/client/shared/hooks/useExposeRef.ts
import { type RefObject, useEffect, useRef } from 'react';

export type RefValue<T> = T extends RefObject<infer R> ? R : never;
export type ExposeRef<T extends object, E extends object> = T & { ref?: RefObject<E | null> };

// Overload: props and expose must both be defined
export function useExposeRef<T extends { ref?: RefObject<any> }>(props: T, expose: RefValue<T['ref']>): RefObject<RefValue<T['ref']>>;

// Overload: both props and expose are undefined
export function useExposeRef<T extends { ref?: RefObject<any> }>(props?: undefined, expose?: undefined): RefObject<RefValue<T['ref']>>;

// Implementation
export function useExposeRef<T extends { ref?: RefObject<any> }>(props?: T, expose?: RefValue<T['ref']>) {
  if (props && expose) {
    useEffect(() => {
      if (props.ref) {
        props.ref.current = expose;
      }

      return () => {
        if (props.ref) {
          props.ref.current = null;
        }
      };
    }, [props.ref, ...Object.values(expose)]);
  }

  return useRef<RefValue<T['ref']>>(null);
}
