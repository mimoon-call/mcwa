import crypto from 'crypto';

const algorithm = 'aes-256-cbc'; // AES encryption algorithm
const ivLength = 16; // IV length for AES

const deriveKey = (key: string): Buffer => {
  return crypto.createHash('sha256').update(key).digest(); // Generate a 256-bit key
};

const encryptString = (text: string, key: string): string => {
  const derivedKey = deriveKey(key);
  const iv = crypto.randomBytes(ivLength); // Generate a random IV
  const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

  return `${iv.toString('hex')}:${encrypted.toString('hex')}`; // Concatenate IV and encrypted data
};

const decryptString = (encryptedString: string, key: string): string => {
  const derivedKey = deriveKey(key);

  const [ivHex, encryptedHex] = encryptedString.split(':');

  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid encrypted string format.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);

  return decrypted.toString('utf8');
};

// Extend the String interface
declare global {
  interface String {
    encrypt(key: string): string;

    decrypt(key: string): string;
  }
}

// Add the methods to String's prototype
String.prototype.encrypt = function (key: string): string {
  return encryptString(this.toString(), key);
};

String.prototype.decrypt = function (key: string): string {
  return decryptString(this.toString(), key);
};
