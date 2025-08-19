import * as React from 'react';
import { useMemo, useState, type CSSProperties, type FC, type SVGAttributes } from 'react';
import type { SizeUnit } from '@models';
import { ICONS, type IconName, type IconPrefix, type IconType, type IconSuffix } from '@components/Icon/Icon.type';
import styles from '@components/Icon/Icon.module.css';
import { cn } from '@client/plugins';

type Props = {
  name: IconName;
  type?: IconType | [IconType, IconType];
  size?: SizeUnit;
  loading?: boolean;
  clickable?: boolean;
  fallback?: IconName;
  ariaLabel?: string;
  [key: string]: unknown;
} & SVGAttributes<SVGSVGElement>;

// Wrapper component to avoid React plugin preamble detection
const SvgWrapper: FC<{ content: string }> = ({ content }) => {
  return React.createElement('g', {
    dangerouslySetInnerHTML: { __html: content }
  });
};

const IconSvg: FC<Props> = (props) => {
  const { name, type = 'solid', size = '1.25rem', loading = false, clickable = false, fallback, ariaLabel, ...attrs } = props;

  const [hover, setHover] = useState(false);

  const iconType = useMemo(() => name.split(':')[0] as IconPrefix, [name]);
  const iconName = useMemo<IconSuffix>(() => name.split(':')[1] as IconSuffix, [name]);
  const fallbackIconName = useMemo<IconSuffix>(() => fallback?.split(':')[1] as IconSuffix, [fallback]);

  const icon = useMemo(() => {
    if (iconType !== 'svg') return undefined;
    const svgIcon = ICONS[iconName] || (fallbackIconName && ICONS[fallbackIconName]);
    const resolvedType = Array.isArray(type) ? (hover ? type[1] : type[0]) : type;
    return svgIcon?.[resolvedType] || svgIcon?.regular || svgIcon?.solid;
  }, [iconType, iconName, fallbackIconName, type, hover]);

  const viewBox = useMemo(() => {
    if (iconType !== 'svg') return undefined;
    return ICONS[iconName]?.viewBox || (fallbackIconName && ICONS[fallbackIconName]?.viewBox) || `0 0 ${size} ${size}`;
  }, [iconType, iconName, fallbackIconName, size]);

  const style: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    maxWidth: size,
    pointerEvents: 'auto',
  };

  return (
    <svg
      className={cn(styles['icon-svg'], clickable || (props.onClick && styles['icon-svg--clickable']), loading && styles['icon-svg--loading'])}
      viewBox={viewBox}
      aria-label={ariaLabel}
      style={style}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      {...(props.onClick ? { role: 'button' } : {})}
      {...attrs}
    >
      {icon && <SvgWrapper content={icon} />}
    </svg>
  );
};

export default IconSvg;
