export default (template: string, values: Record<string, string | number | boolean>): string => {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    return key in values && values[key] !== undefined && values[key] !== null ? String(values[key]) : '';
  });
};
