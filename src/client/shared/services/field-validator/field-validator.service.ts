import type { ValidatorFunction, ValidatorFieldRules, CustomValidator, CoreValidators, TypeOf } from './field-validator.type';
import { FieldValidatorEnum } from './field-validator.enum';
import { numberWithCommas } from '@helpers/number-with-commas';

export default class FieldValidator {
  public constructor(validation: [ValidatorFieldRules, string?]) {
    this.validation = validation;
  }

  public readonly validation: [ValidatorFieldRules, string?];
  private readonly coreValidators: Record<keyof CoreValidators, ValidatorFunction> = {
    required: (inputValue: any, [isRequired, errorMessage = FieldValidatorEnum.REQUIRED]): ReturnType<ValidatorFunction> => {
      if (!isRequired) {
        return [true];
      }

      return [Array.isArray(inputValue) ? !!inputValue?.length : inputValue !== undefined && inputValue !== null && inputValue !== '', errorMessage];
    },
    type: (inputValue: any, [acceptTypes, errorMessage = FieldValidatorEnum.INVALID_TYPE]): ReturnType<ValidatorFunction> => {
      const valueType = this.typeOf(inputValue);
      const validatorTypes = this.toArray(acceptTypes);

      return [!(inputValue !== undefined && !validatorTypes.some((type) => valueType === type)), errorMessage, validatorTypes];
    },
    arrayOf: (inputValue: any, [acceptTypes, errorMessage = FieldValidatorEnum.INVALID_TYPE]): ReturnType<ValidatorFunction> => {
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
    regex: (inputValue: any, [regExPatterns, errorMessage = FieldValidatorEnum.MISMATCH, options]): ReturnType<ValidatorFunction> => {
      const { checkMode, valueReturn } = options || {};
      const errors: ReturnType<ValidatorFunction>[] = [];
      const isEvery = checkMode === 'every';

      if (inputValue === undefined || inputValue === null || inputValue === '') {
        return [true];
      }

      for (const container of this.toArray(regExPatterns)) {
        const [pattern, message = errorMessage] = this.toArray(container);
        const regexPattern = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        const valid = regexPattern.test((inputValue || '').toString());

        if (isEvery && !valid) {
          return [false, message, regexPattern.toString().slice(1, -1)];
        }

        errors.push([valid, message, valueReturn ? regexPattern.toString().slice(1, -1) : undefined]);
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
    equal: (inputValue: any, [equalValue, errorMessage = FieldValidatorEnum.MISMATCH, options]): ReturnType<ValidatorFunction> => {
      const { valueReturn } = options || {};
      const values = (() => (this.typeOf(equalValue) === 'Object' ? Object.keys(equalValue) : null))() || this.toArray(equalValue);

      if (inputValue === undefined) {
        return [true];
      } else if (Array.isArray(inputValue)) {
        return [
          inputValue.every((inValue) => values.some((eqValue) => inValue === eqValue)),
          errorMessage,
          valueReturn ? (values as string[]) : undefined,
        ];
      }

      return [values.some((eqValue) => inputValue === eqValue), errorMessage, valueReturn ? (values as string[]) : undefined];
    },
    max: (inputValue: any, [maxValue, errorMessage = FieldValidatorEnum.MAX]): ReturnType<ValidatorFunction> => {
      return [
        inputValue === null || inputValue === undefined || (!isNaN(+inputValue) && +inputValue <= maxValue),
        errorMessage,
        numberWithCommas(maxValue),
      ];
    },
    min: (inputValue: any, [minValue, errorMessage = FieldValidatorEnum.MIN]): ReturnType<ValidatorFunction> => {
      return [
        inputValue === null || inputValue === undefined || (!isNaN(+inputValue) && +inputValue >= minValue),
        errorMessage,
        numberWithCommas(minValue),
      ];
    },
    minDate: (inputValue: any, [minValue, errorMessage = FieldValidatorEnum.MIN_DATE, dateFormatter]): ReturnType<ValidatorFunction> => {
      return [
        !minValue || !inputValue || new Date(inputValue) >= new Date(minValue),
        errorMessage,
        dateFormatter ? dateFormatter(minValue) : minValue,
      ];
    },
    maxDate: (inputValue: any, [maxValue, errorMessage = FieldValidatorEnum.MAX_DATE, dateFormatter]): ReturnType<ValidatorFunction> => {
      return [
        !maxValue || !inputValue || new Date(inputValue) <= new Date(maxValue),
        errorMessage,
        dateFormatter ? dateFormatter(maxValue) : maxValue,
      ];
    },
    dateBetween: (
      inputValue: any,
      [minValue, maxValue, errorMessage = FieldValidatorEnum.DATE_BETWEEN, dateFormatter]
    ): ReturnType<ValidatorFunction> => {
      return [
        !inputValue || (new Date(inputValue) >= new Date(minValue) && new Date(inputValue) <= new Date(maxValue)),
        errorMessage,
        dateFormatter ? `${dateFormatter(minValue)} - ${dateFormatter(maxValue)}` : `${minValue} - ${maxValue}`,
      ];
    },
    length: (inputValue: any, [lengthValue, errorMessage = FieldValidatorEnum.LENGTH]): ReturnType<ValidatorFunction> =>
      this.isValidType(inputValue, ['String', 'Number', 'Array']) ? [this.getLength(inputValue) === lengthValue, errorMessage, lengthValue] : [true],
    maxLength: (inputValue: any, [maxLengthValue, errorMessage = FieldValidatorEnum.MAX_LENGTH]): ReturnType<ValidatorFunction> =>
      this.isValidType(inputValue, ['String', 'Number', 'Array'])
        ? [this.getLength(inputValue) < maxLengthValue + 1 || inputValue === undefined, errorMessage, maxLengthValue]
        : [true],
    minLength: (inputValue: any, [minLengthValue, errorMessage = FieldValidatorEnum.MIN_LENGTH]): ReturnType<ValidatorFunction> =>
      this.isValidType(inputValue, ['String', 'Number', 'Array'])
        ? [this.getLength(inputValue) >= minLengthValue || inputValue === undefined, errorMessage, minLengthValue]
        : [true],
  };

  public validate(fieldValue: any): { message: string; value: any } | undefined {
    const [validators, mainMessage] = this.validation;
    const { custom: customValidators = [], ...coreValidators } = validators;

    const { message, value } =
      this.execute(fieldValue, [
        ...Object.entries(coreValidators).reduce((result: CustomValidator[], [name, payload]: [string, any]) => {
          const [validatorValue, errorMessage = mainMessage, ...arg] = payload;
          const validate = this.coreValidators[name as keyof CoreValidators]?.(fieldValue, [validatorValue, errorMessage, ...arg]);

          return [...result, ...(validate ? [validate] : [])];
        }, []),
        ...customValidators,
      ]) || {};

    return message ? { message, value } : undefined;
  }

  private execute(value: any, validators: CustomValidator[]): { message: string; value?: string | number } | undefined {
    for (const validator of validators) {
      const [isValid, errorMessage, validatorValue] = validator instanceof Function ? validator(value) : validator;

      if (!isValid) {
        return { message: errorMessage || FieldValidatorEnum.GENERAL_ERROR, value: validatorValue as any };
      }
    }
  }

  private typeOf(obj: any): TypeOf {
    const typeString = Object.prototype.toString.call(obj);
    return typeString.slice(8, -1) as TypeOf;
  }

  private toArray<T extends object = any>(value: any): T[] {
    return Array.isArray(value) ? value : [value];
  }

  private getLength(value: any): number {
    return (Array.isArray(value) ? value : (value || '').toString()).length;
  }

  private isValidType(value: any, accept: TypeOf[]) {
    return accept.includes(this.typeOf(value));
  }
}
