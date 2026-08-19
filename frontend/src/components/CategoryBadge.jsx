import CategoryIcon from './CategoryIcon';
import { categoryColors } from '../categories';
import { useDarkMode } from '../theme-hook';

export default function CategoryBadge({ category, size = 34, iconSize = 16, radius = 10 }) {
  const dark = useDarkMode();
  const { badgeBg, iconColor } = categoryColors(category, dark);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: badgeBg,
        color: iconColor,
      }}
    >
      <CategoryIcon category={category} size={iconSize} />
    </div>
  );
}
