/** Einstellungen / Settings: Data, Fill my list, Appearance, Sound. No goals, no statistics. */
import type { ComponentChildren } from 'preact';
import { speech, type VoiceStatus } from '../../audio/tts';
import { LOCALES, t, type Locale } from '../../i18n';
import type { Settings as Prefs, Theme } from '../../state/settings';
import type { Store } from '../../storage/store';
import { BackIcon } from '../icons';
import { DataBackup } from './DataBackup';

export interface SettingsProps {
  store: Store;
  prefs: Prefs;
  voice: VoiceStatus;
  quarantined: number;
  /** Data source block (slice 3) and Fill my list (slice 4) are rendered by the app and passed in. */
  dataSource?: ComponentChildren;
  fillMyList?: ComponentChildren;
  onPrefs: (p: Prefs) => void;
  onRestored: () => void;
  onClose: () => void;
}

const THEMES: Theme[] = ['light', 'dark', 'system'];

function Seg<T extends string>({ value, options, label, render, onChange }: {
  value: T; options: readonly T[]; label: string; render: (o: T) => string; onChange: (o: T) => void;
}) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" key={o} aria-checked={value === o} onClick={() => onChange(o)}>
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ComponentChildren }) {
  return (
    <section class="settings-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} class="label">{title}</h2>
      {children}
    </section>
  );
}

export function Settings(p: SettingsProps) {
  const { prefs } = p;
  return (
    <main class="screen settings">
      <header class="screen-top">
        <button type="button" class="icon-btn" aria-label={t('common.back')} onClick={p.onClose}>
          <BackIcon />
        </button>
        <h1>{t('settings.title')}</h1>
      </header>

      <Section id="data" title={t('section.data')}>
        {p.dataSource}
        <DataBackup store={p.store} quarantined={p.quarantined} onRestored={p.onRestored} />
      </Section>

      {p.fillMyList && (
        <Section id="fill" title={t('section.fill')}>
          {p.fillMyList}
        </Section>
      )}

      <Section id="appearance" title={t('section.appearance')}>
        <h3 class="field-label">{t('appearance.theme')}</h3>
        <Seg value={prefs.theme} options={THEMES} label={t('appearance.theme')} render={(o) => t(`theme.${o}`)} onChange={(theme) => p.onPrefs({ ...prefs, theme })} />
        <h3 class="field-label">{t('appearance.language')}</h3>
        <Seg value={prefs.locale} options={LOCALES} label={t('appearance.language')} render={(o: Locale) => t(`lang.${o}`)} onChange={(locale) => p.onPrefs({ ...prefs, locale })} />
        <p class="explain">{t('appearance.contentStaysGerman')}</p>
      </Section>

      <Section id="sound" title={t('section.sound')}>
        <p class="explain">
          {p.voice === 'ready' && speech.voice ? t('sound.voice', { name: speech.voice.name })
            : p.voice === 'none' ? t('sound.noVoice')
              : p.voice === 'unsupported' ? t('sound.unsupported')
                : t('sound.loading')}
        </p>
        <h3 class="field-label">{t('sound.vibration')}</h3>
        <Seg value={prefs.haptics ? 'on' : 'off'} options={['on', 'off'] as const} label={t('sound.vibration')} render={(o) => t(`common.${o}`)} onChange={(o) => p.onPrefs({ ...prefs, haptics: o === 'on' })} />
      </Section>
    </main>
  );
}
