import json from '@components/Icon/Icon.json';

export type IconPrefix = 'svg';
export type IconType = 'solid' | 'regular';
export type IconName = `${IconPrefix}:${string}`;

export const ICONS = json as Record<keyof typeof json, Record<IconType | 'viewBox', string>>;
export type IconSuffix = keyof typeof ICONS;
