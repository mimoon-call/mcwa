type Message = string | null;
type Type = TypeOf | Array<TypeOf>;
type Equal = number | string | Record<string, any> | Array<number | string>;
type RegEx = RegExp | Array<RegExp | [RegExp, string?]>;
type CheckMode = 'every' | 'some';

export interface CoreValidators {
  type: [Type, Message?];
  arrayOf: [Type, Message?];
  required: [boolean, string?];
  equal: [Equal, Message?, { valueReturn?: true }?];
  length: [number, Message?];
  maxLength: [number, Message?];
  minLength: [number, Message?];
  max: [number, Message?];
  min: [number, Message?];
  minDate: [Date | number | string | undefined, Message?, dateFormatter?: () => string];
  maxDate: [Date | number | string | undefined, Message?, dateFormatter?: () => string];
  dateBetween: [number, number, Message?, dateFormatter?: () => string];
  regex: [RegEx, Message?, { checkMode?: CheckMode; valueReturn?: true }?];
}

export type TypeOf = 'String' | 'Number' | 'Object' | 'Array' | 'Null' | 'Boolean' | 'Undefined';
export type CustomValidator = ValidatorFunction | ReturnType<ValidatorFunction>;
export type ValidatorFieldRules = Partial<CoreValidators & { custom: Array<CustomValidator> }>;
export type ValidatorFunction<T = any> = (value?: T, ...arg: Array<any>) => [boolean, string?, (string | number | Array<string>)?];
