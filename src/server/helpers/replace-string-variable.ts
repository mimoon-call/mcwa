export default (template: string, values: Record<string, any>): string => {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return key in values ? String(values[key]) : '';
  });
};
