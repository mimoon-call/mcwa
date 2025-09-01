export default (template: string, values: Record<string, string>): string => {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return key in values ? values[key] : '';
  });
};
