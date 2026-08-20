import { CATEGORIES } from '../categories';

export default function CategoryPicker({ value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CATEGORIES.map((c) => {
        const isActive = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold border transition-colors"
            style={
              isActive
                ? {
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-text)',
                    borderColor: 'var(--color-accent)',
                  }
                : {
                    background: 'transparent',
                    color: 'var(--color-chip-inactive-text)',
                    borderColor: 'var(--color-chip-inactive-border)',
                  }
            }
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
