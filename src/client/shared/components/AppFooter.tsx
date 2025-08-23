import React from 'react';

interface AppFooterProps {
  children: React.ReactNode;
}

export default function AppFooter({ children }: AppFooterProps) {
  return <footer className="sticky bottom-0 z-40 bg-white border-t px-4 flex justify-center">{children}</footer>;
}
