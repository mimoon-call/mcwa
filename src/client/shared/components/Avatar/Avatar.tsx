import type { SizeUnit } from '@models';
import type { IconName } from '@components/Icon/Icon.type';
import React, { type FC } from 'react';
import styles from './Avatar.module.css';
import { cn } from '@client/plugins';
import Icon from '@components/Icon/Icon';
import { useTranslation } from 'react-i18next';
import { useTooltip } from '@hooks';

type AvatarProps = {
  src: string | undefined;
  loading?: boolean;
  alt: string;
  tooltip?: string | true;
  size?: SizeUnit;
  className?: string;
  iconName?: IconName;
};

const Avatar: FC<AvatarProps> = ({
  src,
  loading = false,
  alt = 'GENERAL.AVATAR',
  size = '3rem',
  className,
  iconName = 'svg:avatar-male',
  tooltip,
}) => {
  const { t } = useTranslation();
  const style = size ? { width: size, height: size } : undefined;

  const tooltipText = (() => {
    if (tooltip === true) {
      return t(alt);
    }

    return tooltip;
  })();

  const avatarRef = useTooltip<HTMLDivElement>({ text: tooltipText });

  return (
    <div ref={avatarRef} className={cn(styles.avatar, className)} style={style}>
      {loading && <div className={styles['avatar__spinner']} />}
      {src ? (
        <img src={src} alt={alt ? t(alt) : alt} className={styles['avatar__image']} />
      ) : (
        <Icon className={cn(styles['avatar__image'], 'opacity-50')} name={iconName} size={size} />
      )}
    </div>
  );
};

export default Avatar;
