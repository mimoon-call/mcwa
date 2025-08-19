export declare global {
  interface String {
    removeHtmlTags(): string;
    toNumberWithCommas(symbol?: string): string;
    encrypt(key: string): string;
    decrypt(key: string): string;
  }

  interface Number {
    toStringWithCommas(symbol?: string): string;
  }

  interface Window {
    __SSR_DATA__?: {
      id: string;
      [key: string]: any;
    };
    __ESCAPE_STACK__: Array<{ eventId: string; eventCallback: () => void }>;
  }
}
