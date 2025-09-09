import type { SizeUnit } from '@models';
import type { IconName } from '@components/Icon/Icon.type';
import React, { type FC, useState } from 'react';
import styles from './Avatar.module.css';
import { cn } from '@client/plugins';
import Icon from '@components/Icon/Icon';
import { useTranslation } from 'react-i18next';
import { useTooltip } from '@hooks';

type AvatarProps = {
  src: string | undefined | null;
  loading?: boolean;
  alt: string | null;
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
  const [localSrc, setLocalSrc] = useState(src);
  const [isReady, setIsReady] = useState(false);

  const tooltipText = (() => {
    if (tooltip === true) {
      return alt ? t(alt) : undefined;
    }

    return tooltip;
  })();

  const avatarRef = useTooltip<HTMLDivElement>({ text: tooltipText });

  return (
    <div ref={avatarRef} className={cn(styles.avatar, className)} style={style}>
      {loading && <div className={styles['avatar__spinner']} />}
      {localSrc && (
        <img
          src={localSrc}
          alt={alt ? t(alt) : undefined}
          className={cn(styles['avatar__image'], localSrc && !isReady && 'hidden')}
          onLoad={() => setIsReady(true)}
          onError={() => setLocalSrc(undefined)}
        />
      )}

      <Icon className={cn(styles['avatar__image'], 'opacity-50')} name={iconName} size={size} />
    </div>
  );
};

export default Avatar;
