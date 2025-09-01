// src/server/services/record-validator/record-validator.type.ts
import type { TypeOf } from '@server/models';

type Message = string | null;
type Type = TypeOf | TypeOf[];
type Equal = number | string | Record<string, any> | (number | string)[];
type RegEx = RegExp | Array<RegExp | [RegExp, string?]>;
type CheckMode = 'every' | 'some';

export type Validation = [string | string[], RecordValidators, string?];

export type Validations = Array<Validation>;

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
  regex: [RegEx, Message?, { checkMode?: CheckMode; valueReturn?: true }?];
}

export type ValidationErrorResult = [boolean, string?, (string | number | string[])?];
export type CustomValidator = ValidatorFunction | ValidationErrorResult;
export type RecordValidators = Partial<CoreValidators & { custom: Array<CustomValidator> }>;
export type ValidatorFunction<T = unknown> = (value?: T, ...arg: any[]) => Promise<ValidationErrorResult> | ValidationErrorResult;
