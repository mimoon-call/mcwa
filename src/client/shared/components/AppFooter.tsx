import React from 'react';
import { ClassValue } from 'clsx';
import { cn } from '@client/plugins';

interface AppFooterProps {
  children: React.ReactNode;
  className?: ClassValue;
}

export default function AppFooter({ children, className }: AppFooterProps) {
  return <footer className={cn('sticky bottom-0 z-40 bg-white border-t px-4 flex justify-center', className)}>{children}</footer>;
}
