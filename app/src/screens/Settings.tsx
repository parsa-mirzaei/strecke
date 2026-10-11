import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { EXERCISE_TYPES, type ExerciseType } from '@core/exercises.ts';
import { thinRows } from '@core/engine/eligibility.ts';
import { LIMITS, parseSettings, type Settings } from '@core/engine/settings.ts';
import type { Ctx } from '../appctx';
import { audio, audioCache, charsToday, keystore, unlockAudio } from '../audio/browser';
import { estimateChars } from '../audio/service';
import { explain, listModels, listVoices, type ModelInfo, type VoiceInfo } from '../audio/elevenlabs';
import { speech, type VoiceStatus } from '../audio/tts';
import { clearStore } from '../data/idb';
import { formatNumber, t, type StringKey } from '../i18n';
import { APP_NAME, LANGUAGE_NAMES, PROVIDER_NAME, SAMPLE_SENTENCE } from '../i18n/names';
import { CHANNEL, LS_PREFIX } from '../ns';
import { kindLabel } from '../run/parts';
import { Icon } from '../ui/Icon';
import { LICENCES } from './licences';
import { SheetSection } from './SheetSection';
import { StorageSection } from './StorageSection';

type Page = 'uebungen' | 'audio' | 'daten' | 'darstellung' | 'ziele' | 'ueber';
const PAGES: readonly Page[] = ['uebungen', 'audio', 'daten', 'darstellung', 'ziele', 'ueber'];
const GATES: ExerciseType[] = ['luecke', 'tippen', 'kontext2'];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label class="switch">
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span />
    </label>
  );
}

function Stepper({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={t('stepper.down')} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <output>{value}</output>
      <button type="button" aria-label={t('stepper.up')} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children?: ComponentChildren }) {
  return <div class="field"><div class="lbl">{label}{note ? <small>{note}</small> : null}</div>{children}</div>;
}

function More({ children, title }: { children: ComponentChildren; title?: string }) {
  return <details class="more-set"><summary>{title ?? t('common.advanced')}</summary>{children}</details>;
}

// ---------------------------------------------------------------- groups

function Uebungen({ ctx, set }: { ctx: Ctx; set: (f: (s: Settings) => Settings) => void }) {
  const s = ctx.settings;
  const toggle = (type: ExerciseType, on: boolean) => set((x) => ({ ...x, disabled: on ? x.disabled.filter((d) => d !== type) : [...x.disabled, type] }));
  const gateOff = GATES.some((g) => s.disabled.includes(g));
  return (
    <>
      <Field label={t('ex.newPerRun')} note={t('ex.newPerRunNote')}><Stepper label={t('ex.newPerRun')} value={s.newPerRun} min={LIMITS.newPerRun[0]} max={Math.min(LIMITS.newPerRun[1], s.runLength)} onChange={(v) => set((x) => ({ ...x, newPerRun: v }))} /></Field>
      <Field label={t('ex.runLength')} note={t('ex.runLengthNote')}><Stepper label={t('ex.runLength')} value={s.runLength} min={LIMITS.runLength[0]} max={LIMITS.runLength[1]} onChange={(v) => set((x) => ({ ...x, runLength: v }))} /></Field>
      <p class="kicker">{t('ex.types')}</p>
      {EXERCISE_TYPES.filter((type) => type !== 'karte').map((type) => (
        <Field key={type} label={kindLabel(type)} note={t(`ex.note.${type}` as StringKey)}>
          <Switch label={kindLabel(type)} checked={!s.disabled.includes(type)} onChange={(on) => toggle(type, on)} />
        </Field>
      ))}
      <p class="note">{t('ex.columnsNote')}</p>
      {gateOff ? <p class="warn">{t('ex.gateWarn')}</p> : null}
      <More>
        <Field label={t('ex.gap')} note={t('ex.gapNote')}>
          <Stepper label={t('ex.gapLabel')} value={s.runGapMin} min={LIMITS.runGapMin[0]} max={LIMITS.runGapMin[1]} step={5} onChange={(v) => set((x) => ({ ...x, runGapMin: v }))} />
        </Field>
      </More>
    </>
  );
}

function AudioGroup({ ctx, set }: { ctx: Ctx; set: (f: (s: Settings) => Settings) => void }) {
  const a = ctx.settings.audio;
  const [voice, setVoice] = useState<VoiceStatus>(speech.status);
  const [hasKey, setHasKey] = useState(keystore.has());
  const [keyText, setKeyText] = useState('');
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [bytes, setBytes] = useState(audioCache.bytes());
  useEffect(() => speech.subscribe(setVoice), []);

  const texts = useMemo(() => ctx.words.flatMap((w) => [...w.examples.map((e) => e.de), w.de]), [ctx.words]);
  const allChars = useMemo(() => estimateChars(texts, new Set()), [texts]);

  async function load() {
    const key = keystore.get();
    if (!key) return;
    setBusy(true);
    setMsg('');
    try {
      const [v, m] = await Promise.all([listVoices(key), listModels(key).catch(() => [] as ModelInfo[])]);
      setVoices(v);
      setModels(m);
      if (!a.voiceId && v[0]) set((x) => ({ ...x, audio: { ...x.audio, voiceId: v[0]!.id } }));
      setMsg(v.length ? t('audio.msg.loaded') : t('audio.msg.none'));
    } catch (e) {
      setMsg(t(`audio.err.${explain(e)}`));
    }
    setBusy(false);
  }

  useEffect(() => { if (a.provider === 'elevenlabs' && hasKey) void load(); }, [a.provider, hasKey]);

  function saveKey() {
    if (!keyText.trim()) return;
    if (keystore.set(keyText)) { setKeyText(''); setHasKey(true); setMsg(t('audio.msg.keySaved')); }
    else setMsg(t('audio.msg.noStorage'));
  }
  function removeKey() {
    keystore.clear();
    setHasKey(false);
    setVoices([]);
    setModels([]);
    set((x) => ({ ...x, audio: { ...x.audio, provider: 'device', voiceId: '' } }));
    setMsg(t('audio.msg.keyRemoved'));
  }
  async function test() {
    unlockAudio();
    setBusy(true);
    const played = await audio.speak(SAMPLE_SENTENCE, 'test');
    setBusy(false);
    setMsg(played === 'cloud' || played === 'cache' ? t('audio.msg.cloud') : played === 'device' ? t('audio.msg.fallback') : t('audio.msg.silent'));
    setBytes(audioCache.bytes());
  }
  async function clearCache() {
    await audioCache.clear();
    setBytes(0);
    setMsg(t('audio.msg.cleared'));
  }

  const deviceStatus = voice === 'ready' ? (speech.voice ? t('audio.voiceFoundName', { name: speech.voice.name }) : t('audio.voiceFound'))
    : voice === 'loading' ? t('audio.voiceLoading')
    : t('audio.voiceNone');

  return (
    <>
      <p class="kicker">{t('audio.voice')}</p>
      <div class="seg" role="group" aria-label={t('audio.voice')}>
        <button type="button" aria-pressed={a.provider === 'device'} onClick={() => set((x) => ({ ...x, audio: { ...x.audio, provider: 'device' } }))}>{t('audio.device')}</button>
        <button type="button" aria-pressed={a.provider === 'elevenlabs'} onClick={() => set((x) => ({ ...x, audio: { ...x.audio, provider: 'elevenlabs' } }))}>{PROVIDER_NAME}</button>
      </div>
      <p class="note" style={{ marginTop: '10px' }}>{a.provider === 'device' ? t('audio.deviceNote', { status: deviceStatus }) : t('audio.cloudNote')}</p>

      {a.provider === 'elevenlabs' ? (
        <>
          <p class="warn">{t('audio.keyWarn')}</p>
          {hasKey ? (
            <>
              <Field label={t('audio.key')} note={t('audio.keyStored')}><button class="small-btn" type="button" onClick={removeKey}><Icon name="trash" size={18} />{t('audio.keyRemove')}</button></Field>
              <label class="field" style={{ display: 'block' }}>
                <div class="lbl" style={{ marginBottom: '8px' }}>{t('audio.voice')}</div>
                <select class="text-in" value={a.voiceId} onChange={(e) => set((x) => ({ ...x, audio: { ...x.audio, voiceId: (e.currentTarget as HTMLSelectElement).value } }))}>
                  {!voices.length && a.voiceId ? <option value={a.voiceId}>{a.voiceId}</option> : null}
                  {!voices.length && !a.voiceId ? <option value="">{t('audio.loadingVoices')}</option> : null}
                  {voices.map((v) => <option key={v.id} value={v.id}>{v.german ? t('audio.german', { name: v.name }) : v.name}</option>)}
                </select>
              </label>
              <div class="btn-row">
                <button class="small-btn solid" type="button" disabled={busy || !a.voiceId} onClick={test}><Icon name="play" size={18} />{t('audio.test')}</button>
                <button class="small-btn" type="button" disabled={busy} onClick={load}><Icon name="refresh-cw" size={18} />{t('audio.reload')}</button>
              </div>
            </>
          ) : (
            <label class="field" style={{ display: 'block' }}>
              <div class="lbl" style={{ marginBottom: '8px' }}>{t('audio.keyLabel')}</div>
              <input class="text-in" type="password" autocomplete="off" autocapitalize="off" spellcheck={false} value={keyText} placeholder={t('audio.keyPlaceholder')} onInput={(e) => setKeyText((e.currentTarget as HTMLInputElement).value)} />
              <div class="btn-row"><button class="small-btn solid" type="button" disabled={!keyText.trim()} onClick={saveKey}><Icon name="key-round" size={18} />{t('common.save')}</button></div>
            </label>
          )}
          {msg ? <p class="note" role="status">{msg}</p> : null}
          <More>
            <label class="field" style={{ display: 'block' }}>
              <div class="lbl" style={{ marginBottom: '8px' }}>{t('audio.model')}<small>{t('audio.modelNote')}</small></div>
              <select class="text-in" value={a.modelId} onChange={(e) => set((x) => ({ ...x, audio: { ...x.audio, modelId: (e.currentTarget as HTMLSelectElement).value } }))}>
                <option value="">{t('audio.modelDefault')}</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                {a.modelId && !models.some((m) => m.id === a.modelId) ? <option value={a.modelId}>{a.modelId}</option> : null}
              </select>
            </label>
            <Field label={t('audio.prefetch')} note={t('audio.prefetchNote', { n: formatNumber(allChars) })}>
              <Switch label={t('audio.prefetch')} checked={a.prefetch} onChange={(v) => set((x) => ({ ...x, audio: { ...x.audio, prefetch: v } }))} />
            </Field>
            <Field label={t('audio.cap')} note={t('audio.capNote', { n: formatNumber(charsToday()) })}>
              <Stepper label={t('audio.cap')} value={a.dailyCharCap} min={LIMITS.dailyCharCap[0]} max={LIMITS.dailyCharCap[1]} step={500} onChange={(v) => set((x) => ({ ...x, audio: { ...x.audio, dailyCharCap: v } }))} />
            </Field>
            <Field label={t('audio.cache')} note={t('audio.cacheNote', { used: (bytes / 1048576).toFixed(1), max: a.cacheMaxMB })}>
              <Stepper label={t('audio.cacheLabel')} value={a.cacheMaxMB} min={LIMITS.cacheMaxMB[0]} max={LIMITS.cacheMaxMB[1]} step={5} onChange={(v) => set((x) => ({ ...x, audio: { ...x.audio, cacheMaxMB: v } }))} />
            </Field>
            <div class="btn-row"><button class="small-btn" type="button" onClick={clearCache}><Icon name="trash" size={18} />{t('audio.cacheClear')}</button></div>
          </More>
        </>
      ) : null}
    </>
  );
}

const COLUMN_LABEL: Record<string, StringKey> = {
  'example_de, example_en': 'data.col.example', 'example_2_de, example_2_en': 'data.col.example2', plural: 'data.col.plural',
  collocation: 'data.col.collocation', prep: 'data.col.prep', article: 'data.col.article', 'wrong_1, wrong_2': 'data.col.wrong',
};

function Daten({ ctx }: { ctx: Ctx }) {
  const [confirm, setConfirm] = useState(false);
  const thin = useMemo(() => thinRows(ctx.words), [ctx.words]);

  async function reset() {
    ctx.app.close();
    await clearStore();
    await audioCache.clear();
    try { Object.keys(localStorage).filter((k) => k.startsWith(LS_PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* storage blocked */ }
    location.reload();
  }

  return (
    <>
      <SheetSection ctx={ctx} />

      <p class="kicker">{t('data.missing')}</p>
      {thin.rows.length === 0 ? <p class="note">{t('data.allGood')}</p> : (
        <>
          <p class="note">{t('data.thin', { n: thin.rows.length, total: ctx.words.length })}</p>
          <ul class="hard-list">
            {thin.byColumn.map((c) => (
              <li key={c.column}>
                <div><span class="nm">{COLUMN_LABEL[c.column] ? t(COLUMN_LABEL[c.column]!) : c.column}</span><br /><span class="ct">{t('data.colLine', { column: c.column, types: c.unlocks.map(kindLabel).join(', ') })}</span></div>
                <span class="nm">{c.rows}</span>
              </li>
            ))}
          </ul>
          <More title={t('data.showWords')}>
            <ul class="hard-list">
              {thin.rows.slice(0, 12).map((r) => (
                <li key={r.wordId}><div><span class="nm" lang="de">{r.de}</span><br /><span class="ct">{r.hints.map((h) => t(`hint.${h.code}`)).join(' · ')}</span></div></li>
              ))}
            </ul>
          </More>
        </>
      )}

      <StorageSection ctx={ctx} />

      <More title={t('data.reset')}>
        <p class="note">{t('data.resetNote')}</p>
        <div class="btn-row">
          {!confirm
            ? <button class="small-btn" type="button" onClick={() => setConfirm(true)}><Icon name="rotate-ccw" size={18} />{t('data.reset')}</button>
            : <><button class="small-btn solid" type="button" onClick={() => void reset()}>{t('data.resetConfirm')}</button><button class="small-btn" type="button" onClick={() => setConfirm(false)}>{t('common.cancel')}</button></>}
        </div>
      </More>
    </>
  );
}

function Darstellung({ ctx, set }: { ctx: Ctx; set: (f: (s: Settings) => Settings) => void }) {
  const s = ctx.settings;
  const themes: Array<[Settings['theme'], StringKey]> = [['system', 'look.system'], ['light', 'look.light'], ['dark', 'look.dark']];
  return (
    <>
      <Field label={t('look.language')} note={t('look.languageNote')}>
        <div class="seg" role="group" aria-label={t('look.language')}>
          {(['en', 'de'] as const).map((v) => <button key={v} type="button" lang={v} aria-pressed={s.locale === v} onClick={() => set((x) => ({ ...x, locale: v }))}>{LANGUAGE_NAMES[v]}</button>)}
        </div>
      </Field>
      <Field label={t('look.theme')}><div class="seg" role="group" aria-label={t('look.theme')}>{themes.map(([v, key]) => <button key={v} type="button" aria-pressed={s.theme === v} onClick={() => set((x) => ({ ...x, theme: v }))}>{t(key)}</button>)}</div></Field>
      <Field label={t('look.haptics')} note={t('look.hapticsNote')}><Switch label={t('look.haptics')} checked={s.haptics} onChange={(v) => set((x) => ({ ...x, haptics: v }))} /></Field>
      <p class="note">{t('look.motion')}</p>
    </>
  );
}

function Ziele({ ctx, set }: { ctx: Ctx; set: (f: (s: Settings) => Settings) => void }) {
  const g = ctx.settings.goal;
  return (
    <>
      <p class="note">{t('goal.note')}</p>
      <Field label={t('goal.weekly')} note={t('goal.weeklyNote')}><Switch label={t('goal.weekly')} checked={g.enabled} onChange={(v) => set((x) => ({ ...x, goal: { ...x.goal, enabled: v } }))} /></Field>
      {g.enabled ? <Field label={t('goal.runs')}><Stepper label={t('goal.runs')} value={g.runsPerWeek} min={LIMITS.runsPerWeek[0]} max={LIMITS.runsPerWeek[1]} onChange={(v) => set((x) => ({ ...x, goal: { ...x.goal, runsPerWeek: v } }))} /></Field> : null}
    </>
  );
}

function Ueber() {
  return (
    <>
      <p class="note"><b>{APP_NAME}</b> · {t('about.version', { v: __APP_VERSION__ })}{CHANNEL !== 'stable' ? <> · <span class="channel-tag">{t('set.channel')}</span></> : null}</p>
      <p class="note" style={{ marginTop: '10px' }}>{t('about.privacy')}</p>
      <p class="kicker">{t('about.licences')}</p>
      {LICENCES.map((l) => (
        <div class="licence" key={l.name}>
          <b>{l.name}</b>
          {l.used}<br />{l.licence}<br />{l.holder}<br />
          <a href={l.source} target="_blank" rel="noopener noreferrer">{l.source}</a>
        </div>
      ))}
      <p class="note" style={{ marginTop: '12px' }}>{t('about.fullTexts')}</p>
    </>
  );
}

// ---------------------------------------------------------------- screen

export function SettingsScreen({ ctx, onBack }: { ctx: Ctx; onBack: () => void }) {
  const [page, setPage] = useState<Page | null>(null);
  const set = (f: (s: Settings) => Settings) => ctx.setSettings(parseSettings(f(ctx.settings)));
  const s = ctx.settings;
  const summary: Record<Page, string> = {
    uebungen: t('set.sum.uebungen', { len: s.runLength, new: s.newPerRun }),
    audio: s.audio.provider === 'device' ? t('set.sum.device') : PROVIDER_NAME,
    daten: t('set.sum.daten', { source: ctx.adapter.kind === 'sheet' ? t('set.sum.sheet') : t('set.sum.demo'), n: ctx.words.length }),
    darstellung: s.theme === 'system' ? t('set.sum.system') : s.theme === 'light' ? t('look.light') : t('look.dark'),
    ziele: s.goal.enabled ? t('set.sum.goal', { n: s.goal.runsPerWeek }) : t('common.off'),
    ueber: t('set.sum.version', { v: __APP_VERSION__ }),
  };

  return (
    <>
      <header class="top">
        <div class="row">
          <button class="quiet" type="button" onClick={page ? () => setPage(null) : onBack}><Icon name="chevron-left" size={20} />{page ? t('set.title') : t('common.back')}</button>
          <span class="run">{page ? t(`set.page.${page}`) : t('set.title')}{CHANNEL !== 'stable' ? <span class="channel-tag">{t('set.channel')}</span> : null}</span>
        </div>
      </header>
      <div class="page enter" key={page ?? 'menu'}>
        {!page ? (
          <>
            {CHANNEL !== 'stable' ? <p class="note channel-note">{t('set.channelNote')}</p> : null}
            <ul class="menu">
              {PAGES.map((p) => (
                <li key={p}>
                  <button type="button" onClick={() => setPage(p)}>
                    <span><span class="t">{t(`set.page.${p}`)}</span><span class="s">{summary[p]}</span></span>
                    <Icon name="chevron-right" size={20} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : page === 'uebungen' ? <Uebungen ctx={ctx} set={set} />
          : page === 'audio' ? <AudioGroup ctx={ctx} set={set} />
          : page === 'daten' ? <Daten ctx={ctx} />
          : page === 'darstellung' ? <Darstellung ctx={ctx} set={set} />
          : page === 'ziele' ? <Ziele ctx={ctx} set={set} />
          : <Ueber />}
      </div>
    </>
  );
}
