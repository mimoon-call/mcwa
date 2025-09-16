// Browser-compatible crypto implementation using Web Crypto API
const getCrypto = () => {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  throw new Error('Crypto not available in this environment');
};

const algorithm = 'AES-CBC';

const deriveKey = async (key: string): Promise<CryptoKey> => {
  const crypto = getCrypto();
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: algorithm },
    false,
    ['encrypt', 'decrypt']
  );
};

const generateIV = (): Uint8Array => {
  const crypto = getCrypto();
  return crypto.getRandomValues(new Uint8Array(16));
};

const encryptString = async (text: string, key: string): Promise<string> => {
  const crypto = getCrypto();
  const derivedKey = await deriveKey(key);
  const iv = generateIV();
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: algorithm, iv },
    derivedKey,
    data
  );
  
  const encryptedArray = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv);
  combined.set(encryptedArray, iv.length);
  
  return Array.from(combined)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

const decryptString = async (encryptedString: string, key: string): Promise<string> => {
  const crypto = getCrypto();
  const derivedKey = await deriveKey(key);
  
  // Convert hex string back to bytes
  const bytes = new Uint8Array(encryptedString.length / 2);
  for (let i = 0; i < encryptedString.length; i += 2) {
    bytes[i / 2] = parseInt(encryptedString.substr(i, 2), 16);
  }
  
  const iv = bytes.slice(0, 16);
  const encrypted = bytes.slice(16);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: algorithm, iv },
    derivedKey,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
};

// Export the functions for use instead of extending String prototype
export { encryptString, decryptString };