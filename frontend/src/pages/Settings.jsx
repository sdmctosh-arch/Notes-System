import { useState } from 'react';
import { Link } from 'react-router-dom';
import { setTheme } from '../theme';
import { useDarkMode } from '../theme-hook';
import { setSetting } from '../settings';
import { useSettings } from '../settings-hook';
import PageShell from '../components/PageShell';
import { useIsDesktop } from '../useIsDesktop';

function SectionLabel({ children }) {
  return (
    <div className="px-5 pt-6 pb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </div>
  );
}

function Row({ children }) {
  return (
    <div
      className="mx-4 flex items-center gap-3 rounded-2xl border px-4 py-3.5"
      style={{ background: 'var(--color-card-bg)', borderColor: 'var(--color-border)', boxShadow: 'var(--color-card-shadow)' }}
    >
      {children}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <Row>
      <div className="min-w-0 grow">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </div>
        {hint && (
          <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {hint}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className="shrink-0 w-[38px] h-[22px] rounded-full flex items-center px-[3px]"
        style={{ background: 'var(--color-sel)', border: '1px solid var(--color-border)', justifyContent: checked ? 'flex-end' : 'flex-start' }}
      >
        <span className="w-4 h-4 rounded-full" style={{ background: checked ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
      </button>
    </Row>
  );
}

function LinkRow({ to, label, hint }) {
  return (
    <Link to={to} className="block">
      <Row>
        <div className="min-w-0 grow">
          <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {label}
          </div>
          {hint && (
            <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {hint}
            </div>
          )}
        </div>
        <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          &rarr;
        </span>
      </Row>
    </Link>
  );
}

function DaysRow({ label, hint, value, onChange }) {
  return (
    <Row>
      <div className="min-w-0 grow">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </div>
        {hint && (
          <div className="text-[12.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {hint}
          </div>
        )}
      </div>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className="shrink-0 w-14 rounded-lg border px-2 py-1.5 text-sm text-center outline-none"
        style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
      />
    </Row>
  );
}

export default function Settings() {
  const dark = useDarkMode();
  const { dense, newDays, staleDays } = useSettings();
  const isDesktop = useIsDesktop();
  const [loggedOut, setLoggedOut] = useState(false);

  const content = (
    <>
      <div className="px-5 pt-7 pb-1 flex items-start justify-between gap-3">
        <h1 className="font-serif font-semibold text-[26px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Settings
        </h1>
        {!isDesktop && (
          <Link to="/" className="text-[13px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            &larr; Inbox
          </Link>
        )}
      </div>

      <SectionLabel>Appearance</SectionLabel>
      <div className="flex flex-col gap-2.5 pb-2.5">
        <ToggleRow label="Dark mode" checked={dark} onChange={(v) => setTheme(v ? 'dark' : 'light')} />
        <ToggleRow
          label="Compact rows"
          hint="Smaller cards, no preview text, in the Inbox and Lists"
          checked={dense}
          onChange={(v) => setSetting('dense', v)}
        />
      </div>

      <SectionLabel>Inbox</SectionLabel>
      <div className="flex flex-col gap-2.5 pb-6">
        <DaysRow
          label="New for"
          hint="Days a note keeps its New label after capture"
          value={newDays}
          onChange={(v) => setSetting('newDays', v)}
        />
        <DaysRow
          label="Stale after"
          hint="Days with no decision before a note gets a Stale label"
          value={staleDays}
          onChange={(v) => setSetting('staleDays', v)}
        />
      </div>

      <SectionLabel>Diagnostics</SectionLabel>
      <div className="flex flex-col gap-2.5 pb-6">
        <LinkRow to="/log" label="Processor log" hint="Classification and enrichment activity from the note processor" />
      </div>
    </>
  );

  return (
    <PageShell loggedOut={loggedOut} onLoggedOut={() => setLoggedOut(true)} onLoginSuccess={() => setLoggedOut(false)}>
      {content}
    </PageShell>
  );
}
