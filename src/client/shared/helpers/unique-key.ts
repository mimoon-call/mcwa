export const uniqueKey = (value: unknown, key?: string | number): string => {
  const input = `${JSON.stringify(value)}${key || ''}`;

  // Compute hash by reducing ASCII values with powers of the index
  const hash = input.split('').reduce((sum, char, index) => {
    const charCode = char.charCodeAt(0);

    return sum + Math.pow(charCode, (index % 10) + 1);
  }, 0);

  // Convert to hexadecimal string
  return hash.toString(16);
};
