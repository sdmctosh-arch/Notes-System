// Ported from the approved mockup. Keep these hues and formulas in sync
// with the canvas if the design changes - there is no other source of
// truth for them.
export const CATEGORIES = [
  { key: 'lookup', label: 'Lookup', hue: 10 },
  { key: 'todo', label: 'Todo', hue: 55 },
  { key: 'project', label: 'Project', hue: 100 },
  { key: 'recipe', label: 'Recipe', hue: 145 },
  { key: 'idea', label: 'Idea', hue: 190 },
  { key: 'media', label: 'Media', hue: 235 },
  { key: 'reference', label: 'Reference', hue: 280 },
  { key: 'grocery', label: 'Grocery', hue: 325 },
  { key: 'unclassified', label: 'Unclassified', hue: null },
];

const BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export function categoryLabel(key) {
  return BY_KEY[key]?.label ?? key;
}

export function categoryColors(key, dark) {
  const hue = BY_KEY[key]?.hue;
  if (hue === null || hue === undefined) {
    return {
      badgeBg: dark ? 'oklch(0.3 0.006 60)' : 'oklch(0.93 0.006 60)',
      iconColor: dark ? 'oklch(0.72 0.01 60)' : 'oklch(0.45 0.01 60)',
      label: dark ? 'oklch(0.65 0.01 60)' : 'oklch(0.5 0.01 60)',
    };
  }
  return {
    badgeBg: `oklch(${dark ? '0.3 0.07' : '0.93 0.035'} ${hue})`,
    iconColor: `oklch(${dark ? '0.78 0.13' : '0.42 0.11'} ${hue})`,
    label: `oklch(${dark ? '0.75 0.12' : '0.5 0.11'} ${hue})`,
  };
}
