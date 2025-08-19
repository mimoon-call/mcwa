// src/server/helpers/object-filter-by-scheme.ts
const schemeGenerate = (scheme: { [key: string]: 0 | 1 }): Record<string, 0 | 1> => {
  const buildPath = (path: string[], acc: any, value: 0 | 1): any => {
    if (path.length === 0) {
      return value;
    }

    const currentPath = path[0];
    const restPath = path.slice(1);

    if (currentPath === '*') {
      if (!Array.isArray(acc)) {
        acc = [{}];
      }
      acc[0] = buildPath(restPath, acc[0], value);
    } else {
      if (acc[currentPath] === undefined || typeof acc[currentPath] !== 'object') {
        acc[currentPath] = {};
      }
      acc[currentPath] = buildPath(restPath, acc[currentPath], value);
    }

    return acc;
  };

  return Object.entries(scheme).reduce((acc, [key, value]) => {
    const path = key.split('.');
    return buildPath(path, acc, value);
  }, {});
};

const objectFilterByScheme = <Target>(input: Record<string, any>, baseScheme: { [key: string]: 0 | 1 }): Target => {
  const schema = schemeGenerate(baseScheme);

  const filterObject = (currentInput: any, currentSchema: any): any => {
    const filteredResult: Record<string, any> = {};

    for (const key in currentSchema) {
      if (!Object.prototype.hasOwnProperty.call(currentSchema, key)) {
        continue;
      }

      const isObjectSchema = typeof currentSchema[key] === 'object';
      const isObjectInput = typeof currentInput[key] === 'object' && currentInput[key] !== null;

      if (isObjectSchema && isObjectInput) {
        if (Array.isArray(currentSchema[key])) {
          filteredResult[key] = currentInput[key].map((item: any) => filterObject(item, currentSchema[key][0]));
        } else {
          filteredResult[key] = filterObject(currentInput[key], currentSchema[key]);
        }
      } else if (Object.prototype.hasOwnProperty.call(currentInput, key)) {
        filteredResult[key] = currentInput[key];
      }
    }

    return filteredResult;
  };

  return filterObject(input, schema) as Target;
};

export default objectFilterByScheme;
