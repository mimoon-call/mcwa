// src/server/services/record-validator/record-validator.service.ts
import type { ErrorResponseMessage, TypeOf } from '@server/models';
import ServerError from '@server/middleware/errors/server-error';
import objectFilterByScheme from '@server/helpers/object-filter-by-scheme';
import type {
  CoreValidators,
  CustomValidator,
  RecordValidators,
  ValidationErrorResult,
  Validations,
  ValidatorFunction,
} from '@server/services/record-validator/record-validator.type';
import { RecordValidatorMessage } from '@server/services/record-validator/record-validator.message.enum';

export type ValidatorCallback<Target> = {
  successCallback?: (payload?: Target) => Promise<void> | void;
  failedCallback?: (payload?: Array<ErrorResponseMessage>) => Promise<void> | void;
};
export default class RecordValidator<Source = Record<string, any>, Target = Source> {
  public results: Target = {} as Target;
  public errors: Array<ErrorResponseMessage> | null = null;

  constructor(
    private readonly source: Partial<Source>,
    private readonly validation: Validations,
    private throwOnError: boolean = true
  ) {
    this.source = source;
  }

  private async checkField(
    source: any,
    fieldName: string,
    validators: RecordValidators,
    message?: string
  ): Promise<ErrorResponseMessage | undefined> {
    const fieldValue = source[fieldName];

    return await this.check([fieldName, fieldValue], validators, message);
  }

  private async checkNestedField(
    source: any,
    pathParts: string[],
    validators: RecordValidators,
    message?: string
  ): Promise<Array<ErrorResponseMessage>> {
    const errors: Array<ErrorResponseMessage> = [];
    const currentSource = source;

    const diveInto = async (source: any, path: string[], index: number) => {
      const newPath = [...path];

      if (index >= path.length) {
        // Base case: reached the end of the path
        return;
      }

      const part = path[index];

      if (part === '*') {
        if (!Array.isArray(source)) {
          // If current source is not an array when '*' is expected, stop processing
          return;
        }

        for (let i = 0; i < source.length; i++) {
          newPath[index] = i.toString();

          await diveInto(source[i], newPath, index + 1); // Dive into each element of the array
        }
      } else {
        if (source === undefined || source === null) {
          // Stop processing if source is undefined or null
          return;
        }

        if (index === path.length - 1) {
          // We're at the last part of the path, check the field
          const error = await this.checkField(source, part, validators, message);

          if (error) {
            errors.push({ ...error, property: newPath.join('.') });
          }
        } else {
          // Not at the end, dive deeper
          await diveInto(source[part], newPath, index + 1);
        }
      }
    };

    await diveInto(currentSource, pathParts, 0);

    // Assuming checkField correctly handles validation and error generation
    return errors;
  }

  public async validate(options?: ValidatorCallback<Target>): Promise<Target> {
    const { successCallback, failedCallback } = options || {};
    const errors: Array<ErrorResponseMessage> = [];

    for (const item of this.validation) {
      const [fields, validators, message] = item;

      for (const field of Array.isArray(fields) ? fields : [fields]) {
        if (field.includes('.')) {
          const pathParts = field.split('.');
          const nestedErrors = await this.checkNestedField(this.source, pathParts, validators, message);
          errors.push(...nestedErrors);
        } else {
          const error = await this.checkField(this.source, field, validators, message);

          if (error) {
            errors.push(error);
          }
        }
      }
    }

    if (errors.length) {
      this.errors = errors;

      if (failedCallback) {
        await failedCallback(errors);
      } else if (this.throwOnError) {
        throw new ServerError({ messages: errors });
      }
    }

    const scheme = this.validation.reduce((acc: Record<string, 0 | 1>, item: any) => {
      if (Array.isArray(item[0])) {
        item[0].forEach((subItem) => {
          acc[subItem] = 1;
        });
      } else {
        acc[item[0]] = 1;
      }
      return acc;
    }, {});

    this.results = objectFilterByScheme(this.source, scheme) as Target;
    await successCallback?.(this.results);

    return this.results;
  }

  public async check(
    [fieldName, fieldValue]: [string, any?],
    validators: RecordValidators,
    mainMessage?: string
  ): Promise<ErrorResponseMessage | undefined> {
    const { custom: customValidators = [], ...coreValidators } = validators;

    const asyncValidationResults = await Promise.all(
      Object.entries(coreValidators).map(async ([name, payload]: [string, any]) => {
        const [validatorValue, errorMessage = mainMessage, ...arg] = payload;
        const validate = this.coreValidators[name as keyof CoreValidators]?.(fieldValue, [validatorValue, errorMessage, ...arg]);

        if (validate instanceof Promise) {
          return await validate;
        } else {
          return validate;
        }
      })
    );

    const { message, value } = (await this.execute(fieldValue, [...asyncValidationResults, ...customValidators])) || {};

    return message ? { message, value, property: fieldName as string } : undefined;
  }

  private async execute(
    value: any,
    validators: Array<CustomValidator>
  ): Promise<
    | {
        message: string;
        value?: string | number;
      }
    | undefined
  > {
    for (const validator of validators) {
      try {
        const [isValid, errorMessage, validatorValue] = validator instanceof Function ? await validator(value) : validator;

        if (!isValid) {
          return {
            message: errorMessage || RecordValidatorMessage.GENERAL_ERROR,
            value: validatorValue as any,
          };
        }
      } catch (error) {
        return { message: RecordValidatorMessage.GENERAL_ERROR };
      }
    }
  }

  private typeOf(obj: any): TypeOf {
    return /(?<=\s)\w+(|])/.exec(Object.prototype.toString.call(obj))![0] as TypeOf;
  }

  private toArray<T extends object = any>(value: any): T[] {
    return Array.isArray(value) ? value : [value];
  }

  private getLength(value: any): number {
    switch (this.typeOf(value)) {
      case 'Array':
        return value.length;
      case 'Object':
        return Object.keys(value).length;
      default:
        return (value || '').toString().length;
    }
  }

  private isValidType(value: any, accept: TypeOf[]) {
    return accept.includes(this.typeOf(value));
  }

  private coreValidators: Record<keyof CoreValidators, ValidatorFunction> = {
    required: (inputValue: any, [isRequired, errorMessage = RecordValidatorMessage.REQUIRED]): ReturnType<ValidatorFunction> => {
      if (!isRequired) {
        return [true];
      }

      return [inputValue !== undefined && inputValue !== null && inputValue !== '', errorMessage];
    },
    arrayOf: (inputValue: any, [acceptTypes, errorMessage = RecordValidatorMessage.INVALID_TYPE]): ReturnType<ValidatorFunction> => {
      if (inputValue === undefined || inputValue === null || (Array.isArray(inputValue) && !inputValue.length)) {
        return [true];
      }

      if (!Array.isArray(inputValue)) {
        return [false, errorMessage];
      }

      const valueTypes = inputValue.map((value: any): TypeOf => this.typeOf(value));
      const validatorTypes = this.toArray(acceptTypes);

      return [valueTypes.some((type: TypeOf) => validatorTypes.includes(type)), errorMessage, acceptTypes];
    },
    type: (inputValue: any, [acceptTypes, errorMessage = RecordValidatorMessage.INVALID_TYPE]): ReturnType<ValidatorFunction> => {
      const valueType = this.typeOf(inputValue);
      const validatorTypes = this.toArray(acceptTypes);

      return [!(inputValue !== undefined && !validatorTypes.some((type) => valueType === type)), errorMessage, validatorTypes];
    },
    regex: (inputValue: any, [regExPatterns, errorMessage = RecordValidatorMessage.MISMATCH, options]): ValidationErrorResult => {
      const { checkMode, valueReturn } = options || {};
      const errors: Array<ValidationErrorResult> = [];
      const isEvery = checkMode === 'every';

      if (inputValue === undefined || inputValue === null || inputValue === '') {
        return [true];
      }

      for (const container of this.toArray(regExPatterns)) {
        const [regExPattern, message = errorMessage] = this.toArray(container);
        const valid = regExPattern instanceof RegExp && regExPattern.test((inputValue || '').toString());

        if (isEvery && !valid) {
          return [false, message, regExPattern.toString().slice(1, -1)];
        }

        errors.push([valid, message, valueReturn ? regExPattern.toString().slice(1, -1) : undefined]);
      }

      return [
        isEvery ? errors.every(([isValid]) => isValid) : errors.some(([isValid]) => isValid),
        errorMessage,
        valueReturn
          ? this.toArray(regExPatterns)
              .map((regex) => this.toArray(regex)[0].toString().slice(1, -1))
              .join('')
          : undefined,
      ];
    },
    equal: (inputValue: any, [equalValue, errorMessage = RecordValidatorMessage.MISMATCH, options]): ReturnType<ValidatorFunction> => {
      const { valueReturn } = options || {};
      const values = (() => (this.typeOf(equalValue) === 'Object' ? Object.keys(equalValue) : null))() || this.toArray(equalValue);

      if (!inputValue) {
        return [true];
      } else if (Array.isArray(inputValue)) {
        return [inputValue.every((inValue) => values.some((eqValue) => inValue === eqValue)), errorMessage, valueReturn ? values as string[] : undefined];
      }

      return [values.some((eqValue) => inputValue === eqValue), errorMessage, valueReturn ? values as string[] : undefined];
    },
    max: (inputValue: any, [maxValue, errorMessage = RecordValidatorMessage.MAX]): ReturnType<ValidatorFunction> => {
      return [inputValue === null || inputValue === undefined || (!isNaN(+inputValue) && +inputValue <= maxValue), errorMessage, maxValue];
    },
    min: (inputValue: any, [minValue, errorMessage = RecordValidatorMessage.MIN]): ReturnType<ValidatorFunction> => {
      return [inputValue === null || inputValue === undefined || (!isNaN(+inputValue) && +inputValue >= minValue), errorMessage, minValue];
    },
    length: (inputValue: any, [lengthValue, errorMessage = RecordValidatorMessage.LENGTH]): ReturnType<ValidatorFunction> =>
      this.isValidType(inputValue, ['String', 'Number', 'Array']) ? [this.getLength(inputValue) === lengthValue, errorMessage, lengthValue] : [true],
    maxLength: (inputValue: any, [maxLengthValue, errorMessage = RecordValidatorMessage.MAX_LENGTH]): ReturnType<ValidatorFunction> =>
      this.isValidType(inputValue, ['String', 'Number', 'Array'])
        ? [this.getLength(inputValue) <= maxLengthValue || inputValue === undefined || inputValue === null, errorMessage, maxLengthValue]
        : [true],
    minLength: (inputValue: any, [minLengthValue, errorMessage = RecordValidatorMessage.MIN_LENGTH]): ReturnType<ValidatorFunction> =>
      this.isValidType(inputValue, ['String', 'Number', 'Array'])
        ? [this.getLength(inputValue) >= minLengthValue || inputValue === undefined || inputValue === null, errorMessage, minLengthValue]
        : [true],
  };
}
