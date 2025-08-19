// src/client/shared/components/Button/Button.tsx
import React, { type ButtonHTMLAttributes, type FC } from 'react';
import type { ClassValue } from 'clsx';
import styles from '@components/Button/Button.module.css';
import Spinner from '@components/Spinner/Spinner';
import { cn } from '@client/plugins';

type ButtonProps = {
  buttonType?: 'solid' | 'flat';
  className?: ClassValue;
  loading?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>;

const Button: FC<ButtonProps> = (props) => {
  const { loading, disabled, className, buttonType = 'solid', children, ...rest } = props;

  return (
    <button className={cn(styles['button'], styles[`button--${buttonType}`], loading && 'relative', className)} disabled={disabled} {...rest}>
      {loading && (
        <div className="absolute flex align-middle justify-center w-full h-full opacity-50">
          <Spinner size="2rem" />
        </div>
      )}
      <div className={cn('py-1 px-2', disabled && 'opacity-10')}>{children}</div>
    </button>
  );
};

export default Button;
