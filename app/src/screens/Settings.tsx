import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { EXERCISE_TYPES, type ExerciseType } from '@core/exercises.ts';
import { thinRows } from '@core/engine/eligibility.ts';
import { LIMITS, makeExport, parseSettings, readExport, type Settings } from '@core/engine/settings.ts';
import { eventFromRow, eventToRow } from '@core/scheduler.ts';
import type { Ctx } from '../appctx';
import { audio, audioCache, charsToday, keystore, unlockAudio } from '../audio/browser';
import { estimateChars } from '../audio/service';
import { explain, listModels, listVoices, type ModelInfo, type VoiceInfo } from '../audio/elevenlabs';
import { speech, type VoiceStatus } from '../audio/tts';
import { clearStore } from '../data/idb';
import { KIND_LABEL } from '../run/parts';
import { Icon } from '../ui/Icon';
import { LICENCES } from './licences';
import { SheetSection } from './SheetSection';

type Page = 'uebungen' | 'audio' | 'daten' | 'darstellung' | 'ziele' | 'ueber';

const TITLES: Record<Page, string> = {
  uebungen: 'Übungen', audio: 'Audio', daten: 'Daten', darstellung: 'Darstellung', ziele: 'Ziele', ueber: 'Über',
};

const TYPE_NOTE: Partial<Record<ExerciseType, string>> = {
  artikel: 'der, die oder das', plural: 'die Mehrzahl wählen', bedeutung: 'die Bedeutung wählen', luecke: 'ein Wort im Satz ergänzen',
  praeposition: 'die passende Präposition', kollokation: 'ein Wort zur Wortverbindung', hoeren: 'zuhören, Bedeutung wählen (braucht eine deutsche Stimme)',
  tippen: 'das Wort selbst schreiben', reihenfolge: 'Satz aus Wörtern bauen', kontext2: 'dasselbe Wort in einem neuen Satz',
};
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
      <button type="button" aria-label="weniger" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <output>{value}</output>
      <button type="button" aria-label="mehr" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: ComponentChildren }) {
  return <div class="field"><div class="lbl">{label}{note ? <small>{note}</small> : null}</div>{children}</div>;
}

function More({ children, title = 'Erweitert' }: { children: ComponentChildren; title?: string }) {
  return <details class="more-set"><summary>{title}</summary>{children}</details>;
}

// ---------------------------------------------------------------- groups

function Uebungen({ ctx, set }: { ctx: Ctx; set: (f: (s: Settings) => Settings) => void }) {
  const s = ctx.settings;
  const toggle = (t: ExerciseType, on: boolean) => set((x) => ({ ...x, disabled: on ? x.disabled.filter((d) => d !== t) : [...x.disabled, t] }));
  const gateOff = GATES.some((g) => s.disabled.includes(g));
  return (
    <>
      <Field label="Neue Karten pro Runde" note="Wörter, die du zum ersten Mal siehst"><Stepper label="Neue Karten pro Runde" value={s.newPerRun} min={LIMITS.newPerRun[0]} max={Math.min(LIMITS.newPerRun[1], s.runLength)} onChange={(v) => set((x) => ({ ...x, newPerRun: v }))} /></Field>
      <Field label="Karten pro Runde" note="Eine Runde ist kurz gedacht"><Stepper label="Karten pro Runde" value={s.runLength} min={LIMITS.runLength[0]} max={LIMITS.runLength[1]} onChange={(v) => set((x) => ({ ...x, runLength: v }))} /></Field>
      <p class="kicker">Übungsarten</p>
      {EXERCISE_TYPES.filter((t) => t !== 'karte').map((t) => (
        <Field key={t} label={KIND_LABEL[t]} note={TYPE_NOTE[t]}>
          <Switch label={KIND_LABEL[t]} checked={!s.disabled.includes(t)} onChange={(on) => toggle(t, on)} />
        </Field>
      ))}
      <p class="note">Was einer Wörterliste fehlt, bleibt von selbst weg: Für jede Karte gibt es nur Übungen, zu denen die Spalten deines Sheets passen.</p>
      {gateOff ? <p class="warn">Ohne Lücke, Tippen oder Zweiter Kontext rücken Wörter nicht in die nächste Stufe. Sie kommen trotzdem wieder.</p> : null}
      <More>
        <Field label="Pause bis zur nächsten Runde" note="Nach so vielen Minuten ohne Antwort beginnt eine neue Runde">
          <Stepper label="Minuten Pause" value={s.runGapMin} min={LIMITS.runGapMin[0]} max={LIMITS.runGapMin[1]} step={5} onChange={(v) => set((x) => ({ ...x, runGapMin: v }))} />
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
      setMsg(v.length ? 'Stimmen geladen.' : 'Keine Stimmen gefunden.');
    } catch (e) {
      setMsg(explain(e));
    }
    setBusy(false);
  }

  useEffect(() => { if (a.provider === 'elevenlabs' && hasKey) void load(); }, [a.provider, hasKey]);

  function saveKey() {
    if (!keyText.trim()) return;
    if (keystore.set(keyText)) { setKeyText(''); setHasKey(true); setMsg('Schlüssel auf diesem Gerät gespeichert.'); }
    else setMsg('Das Gerät erlaubt kein Speichern.');
  }
  function removeKey() {
    keystore.clear();
    setHasKey(false);
    setVoices([]);
    setModels([]);
    set((x) => ({ ...x, audio: { ...x.audio, provider: 'device', voiceId: '' } }));
    setMsg('Schlüssel entfernt.');
  }
  async function test() {
    unlockAudio();
    setBusy(true);
    const played = await audio.speak('Guten Tag! So klingt diese Stimme.', 'test');
    setBusy(false);
    setMsg(played === 'cloud' || played === 'cache' ? 'Wiedergabe mit ElevenLabs.' : played === 'device' ? 'ElevenLabs war nicht erreichbar, die Gerätestimme hat gesprochen.' : 'Kein Ton möglich: keine deutsche Stimme gefunden.');
    setBytes(audioCache.bytes());
  }
  async function clearCache() {
    await audioCache.clear();
    setBytes(0);
    setMsg('Audio-Cache geleert.');
  }

  const deviceNote = voice === 'ready' ? `Deutsche Stimme gefunden${speech.voice ? `: ${speech.voice.name}` : ''}.`
    : voice === 'loading' ? 'Stimmen werden geladen …'
    : 'Keine deutsche Stimme auf diesem Gerät. Hören-Aufgaben bleiben weg, bis eine Stimme da ist.';

  return (
    <>
      <p class="kicker">Stimme</p>
      <div class="seg" role="group" aria-label="Stimme">
        <button type="button" aria-pressed={a.provider === 'device'} onClick={() => set((x) => ({ ...x, audio: { ...x.audio, provider: 'device' } }))}>Gerätestimme</button>
        <button type="button" aria-pressed={a.provider === 'elevenlabs'} onClick={() => set((x) => ({ ...x, audio: { ...x.audio, provider: 'elevenlabs' } }))}>ElevenLabs</button>
      </div>
      <p class="note" style={{ marginTop: '10px' }}>{a.provider === 'device' ? `Standard, ohne Einrichtung, funktioniert offline. ${deviceNote}` : 'Natürlichere Stimmen mit deinem eigenen Konto bei ElevenLabs.'}</p>

      {a.provider === 'elevenlabs' ? (
        <>
          <p class="warn">Dein Schlüssel bleibt nur auf diesem Gerät. Er wird nirgends hochgeladen, nicht ins Sheet geschrieben und nicht exportiert; er geht nur an api.elevenlabs.io. ElevenLabs berechnet Zeichen: laut elevenlabs.io/pricing/api (Stand Oktober 2026) je nach Modell etwa 0,04 bis 0,08 US-Dollar pro 1.000 Zeichen, zusätzlich zu den Kontingenten deines Tarifs. Jeder Satz wird nur einmal erzeugt und dann gespeichert.</p>
          {hasKey ? (
            <>
              <Field label="Schlüssel" note="Gespeichert auf diesem Gerät"><button class="small-btn" type="button" onClick={removeKey}><Icon name="trash" size={18} />Schlüssel entfernen</button></Field>
              <label class="field" style={{ display: 'block' }}>
                <div class="lbl" style={{ marginBottom: '8px' }}>Stimme</div>
                <select class="text-in" value={a.voiceId} onChange={(e) => set((x) => ({ ...x, audio: { ...x.audio, voiceId: (e.currentTarget as HTMLSelectElement).value } }))}>
                  {!voices.length && a.voiceId ? <option value={a.voiceId}>{a.voiceId}</option> : null}
                  {!voices.length && !a.voiceId ? <option value="">Stimmen laden …</option> : null}
                  {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.german ? ' (Deutsch)' : ''}</option>)}
                </select>
              </label>
              <div class="btn-row">
                <button class="small-btn solid" type="button" disabled={busy || !a.voiceId} onClick={test}><Icon name="play" size={18} />Stimme testen</button>
                <button class="small-btn" type="button" disabled={busy} onClick={load}><Icon name="refresh-cw" size={18} />Stimmen laden</button>
              </div>
            </>
          ) : (
            <label class="field" style={{ display: 'block' }}>
              <div class="lbl" style={{ marginBottom: '8px' }}>ElevenLabs-Schlüssel</div>
              <input class="text-in" type="password" autocomplete="off" autocapitalize="off" spellcheck={false} value={keyText} placeholder="Schlüssel einfügen" onInput={(e) => setKeyText((e.currentTarget as HTMLInputElement).value)} />
              <div class="btn-row"><button class="small-btn solid" type="button" disabled={!keyText.trim()} onClick={saveKey}><Icon name="key-round" size={18} />Speichern</button></div>
            </label>
          )}
          {msg ? <p class="note" role="status">{msg}</p> : null}
          <More>
            <label class="field" style={{ display: 'block' }}>
              <div class="lbl" style={{ marginBottom: '8px' }}>Modell<small>Leer lassen für das Standardmodell von ElevenLabs</small></div>
              <select class="text-in" value={a.modelId} onChange={(e) => set((x) => ({ ...x, audio: { ...x.audio, modelId: (e.currentTarget as HTMLSelectElement).value } }))}>
                <option value="">Standard</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                {a.modelId && !models.some((m) => m.id === a.modelId) ? <option value={a.modelId}>{a.modelId}</option> : null}
              </select>
            </label>
            <Field label="Vorab erzeugen" note={`Audio für kommende Karten laden, solange du online bist. Alle Beispielsätze deiner Wörter: etwa ${allChars.toLocaleString('de-DE')} Zeichen.`}>
              <Switch label="Vorab erzeugen" checked={a.prefetch} onChange={(v) => set((x) => ({ ...x, audio: { ...x.audio, prefetch: v } }))} />
            </Field>
            <Field label="Zeichen pro Tag" note={`Höchstens so viele neue Zeichen am Tag. Heute: ${charsToday().toLocaleString('de-DE')}. Danach spricht die Gerätestimme.`}>
              <Stepper label="Zeichen pro Tag" value={a.dailyCharCap} min={LIMITS.dailyCharCap[0]} max={LIMITS.dailyCharCap[1]} step={500} onChange={(v) => set((x) => ({ ...x, audio: { ...x.audio, dailyCharCap: v } }))} />
            </Field>
            <Field label="Speicher für Audio" note={`Belegt: ${(bytes / 1048576).toFixed(1)} MB von ${a.cacheMaxMB} MB`}>
              <Stepper label="Megabyte" value={a.cacheMaxMB} min={LIMITS.cacheMaxMB[0]} max={LIMITS.cacheMaxMB[1]} step={5} onChange={(v) => set((x) => ({ ...x, audio: { ...x.audio, cacheMaxMB: v } }))} />
            </Field>
            <div class="btn-row"><button class="small-btn" type="button" onClick={clearCache}><Icon name="trash" size={18} />Audio-Cache leeren</button></div>
          </More>
        </>
      ) : null}
    </>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Daten({ ctx }: { ctx: Ctx }) {
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const thin = useMemo(() => thinRows(ctx.words), [ctx.words]);
  const colName: Record<string, string> = {
    'example_de, example_en': 'Beispielsatz', 'example_2_de, example_2_en': 'Zweiter Beispielsatz', plural: 'Mehrzahl', collocation: 'Wortverbindung',
    prep: 'Präposition', article: 'Artikel', 'wrong_1, wrong_2': 'Falsche Antworten',
  };

  function exportAll() {
    const text = JSON.stringify(makeExport(ctx.settings, ctx.events.map((e) => eventToRow(e)), Date.now()), null, 2);
    download(`strecke-sicherung-${new Date().toISOString().slice(0, 10)}.json`, text);
    setMsg(`${ctx.events.length} Antworten und die Einstellungen exportiert. Der Audio-Schlüssel ist nicht enthalten.`);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const res = readExport(await file.text(), (x) => eventFromRow(x as Record<string, string>) !== null);
    if (!res.ok) { setMsg(res.error === 'not_json' ? 'Das ist keine gültige Datei.' : res.error === 'unknown_version' ? 'Diese Sicherung stammt aus einer anderen Version.' : 'Das ist keine Strecke-Sicherung.'); return; }
    const events = res.events.map((r) => eventFromRow(r as Record<string, string>)).filter((e): e is NonNullable<typeof e> => !!e);
    const known = new Set(ctx.words.map((w) => w.id));
    await ctx.adapter.appendEvents(events);
    ctx.setSettings(res.settings);
    await ctx.reload();
    const skipped = events.filter((e) => !known.has(e.wordId)).length;
    setMsg(`${events.length} Antworten eingelesen${skipped ? `, davon ${skipped} zu Wörtern, die es hier nicht gibt` : ''}. Einstellungen übernommen.`);
  }

  async function reset() {
    await clearStore();
    await audioCache.clear();
    try { Object.keys(localStorage).filter((k) => k.startsWith('strecke.')).forEach((k) => localStorage.removeItem(k)); } catch { /* storage blocked */ }
    location.reload();
  }

  return (
    <>
      <SheetSection ctx={ctx} />

      <p class="kicker">Was deinen Wörtern fehlt</p>
      {thin.rows.length === 0 ? <p class="note">Jedes Wort hat alles, was für seine Übungen nötig ist.</p> : (
        <>
          <p class="note"><b>{thin.rows.length}</b> von {ctx.words.length} Wörtern könnten mehr Übungsarten bekommen. Ein Hinweis, keine Aufgabe: Alles läuft auch so.</p>
          <ul class="hard-list">
            {thin.byColumn.map((c) => (
              <li key={c.column}>
                <div><span class="nm">{colName[c.column] ?? c.column}</span><br /><span class="ct">Spalte <span class="mono">{c.column}</span> · bringt {c.unlocks.map((t) => KIND_LABEL[t]).join(', ')}</span></div>
                <span class="nm">{c.rows}</span>
              </li>
            ))}
          </ul>
          <More title="Wörter anzeigen">
            <ul class="hard-list">
              {thin.rows.slice(0, 12).map((r) => (
                <li key={r.wordId}><div><span class="nm">{r.de}</span><br /><span class="ct">{r.hints.map((h) => h.why).join(' · ')}</span></div></li>
              ))}
            </ul>
          </More>
        </>
      )}

      <p class="kicker">Sicherung</p>
      <div class="btn-row">
        <button class="small-btn" type="button" onClick={exportAll}><Icon name="download" size={18} />Exportieren</button>
        <label class="small-btn"><Icon name="upload" size={18} />Importieren<input type="file" accept="application/json,.json" class="sr-only" onChange={(e) => void importFile((e.currentTarget as HTMLInputElement).files?.[0])} /></label>
      </div>
      {msg ? <p class="note" role="status">{msg}</p> : null}

      <More title="Zurücksetzen">
        <p class="note">Löscht alle Antworten, Einstellungen, gespeicherte Audios und den Schlüssel auf diesem Gerät. Deine Wörter im Sheet bleiben unberührt.</p>
        <div class="btn-row">
          {!confirm
            ? <button class="small-btn" type="button" onClick={() => setConfirm(true)}><Icon name="rotate-ccw" size={18} />Zurücksetzen</button>
            : <><button class="small-btn solid" type="button" onClick={() => void reset()}>Ja, alles löschen</button><button class="small-btn" type="button" onClick={() => setConfirm(false)}>Abbrechen</button></>}
        </div>
      </More>
    </>
  );
}

function Darstellung({ ctx, set }: { ctx: Ctx; set: (f: (s: Settings) => Settings) => void }) {
  const s = ctx.settings;
  const themes: Array<[Settings['theme'], string]> = [['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']];
  return (
    <>
      <Field label="Farbschema"><div class="seg" role="group" aria-label="Farbschema">{themes.map(([v, l]) => <button key={v} type="button" aria-pressed={s.theme === v} onClick={() => set((x) => ({ ...x, theme: v }))}>{l}</button>)}</div></Field>
      <Field label="Vibration" note="Ein kurzes Feedback bei Antworten, wo das Gerät es kann"><Switch label="Vibration" checked={s.haptics} onChange={(v) => set((x) => ({ ...x, haptics: v }))} /></Field>
      <p class="note">Bewegung reduzieren folgt der Einstellung deines Geräts.</p>
    </>
  );
}

function Ziele({ ctx, set }: { ctx: Ctx; set: (f: (s: Settings) => Settings) => void }) {
  const g = ctx.settings.goal;
  return (
    <>
      <p class="note">Ein Ziel ist freiwillig und standardmäßig aus. Es gibt kein Tagesziel und nichts, was verfällt.</p>
      <Field label="Wochenziel" note="Zeigt in Verlauf, wie viele Runden du diese Woche geschafft hast"><Switch label="Wochenziel" checked={g.enabled} onChange={(v) => set((x) => ({ ...x, goal: { ...x.goal, enabled: v } }))} /></Field>
      {g.enabled ? <Field label="Runden pro Woche"><Stepper label="Runden pro Woche" value={g.runsPerWeek} min={LIMITS.runsPerWeek[0]} max={LIMITS.runsPerWeek[1]} onChange={(v) => set((x) => ({ ...x, goal: { ...x.goal, runsPerWeek: v } }))} /></Field> : null}
    </>
  );
}

function Ueber() {
  return (
    <>
      <p class="note"><b>Strecke</b> · Version {__APP_VERSION__}</p>
      <p class="note" style={{ marginTop: '10px' }}>Offen und ohne Konto. Deine Antworten bleiben auf diesem Gerät. Die App spricht nur mit zwei Stellen: mit deiner Wörterliste (dem Google Sheet, das du verbindest) und, wenn du es einschaltest, mit der Stimme, die du gewählt hast (ElevenLabs, mit deinem eigenen Schlüssel).</p>
      <p class="kicker">Lizenzen und Quellen</p>
      {LICENCES.map((l) => (
        <div class="licence" key={l.name}>
          <b>{l.name}</b>
          {l.used}<br />{l.licence}<br />{l.holder}<br />
          <a href={l.source} target="_blank" rel="noopener noreferrer">{l.source}</a>
        </div>
      ))}
      <p class="note" style={{ marginTop: '12px' }}>Die vollständigen Lizenztexte stehen in NOTICE.md im Repository.</p>
    </>
  );
}

// ---------------------------------------------------------------- screen

export function SettingsScreen({ ctx, onBack }: { ctx: Ctx; onBack: () => void }) {
  const [page, setPage] = useState<Page | null>(null);
  const set = (f: (s: Settings) => Settings) => ctx.setSettings(parseSettings(f(ctx.settings)));
  const s = ctx.settings;
  const summary: Record<Page, string> = {
    uebungen: `${s.runLength} Karten pro Runde, ${s.newPerRun} neue`,
    audio: s.audio.provider === 'device' ? 'Gerätestimme' : 'ElevenLabs',
    daten: `${ctx.adapter.kind === 'sheet' ? 'Google Sheet' : 'Demo'} · ${ctx.words.length} Wörter`,
    darstellung: s.theme === 'system' ? 'Wie das Gerät' : s.theme === 'light' ? 'Hell' : 'Dunkel',
    ziele: s.goal.enabled ? `${s.goal.runsPerWeek} Runden pro Woche` : 'Aus',
    ueber: `Version ${__APP_VERSION__}`,
  };

  return (
    <>
      <header class="top">
        <div class="row">
          <button class="quiet" type="button" onClick={page ? () => setPage(null) : onBack}><Icon name="chevron-left" size={20} />{page ? 'Einstellungen' : 'Zurück'}</button>
          <span class="run">{page ? TITLES[page] : 'Einstellungen'}</span>
        </div>
      </header>
      <div class="page enter" key={page ?? 'menu'}>
        {!page ? (
          <ul class="menu">
            {(Object.keys(TITLES) as Page[]).map((p) => (
              <li key={p}>
                <button type="button" onClick={() => setPage(p)}>
                  <span><span class="t">{TITLES[p]}</span><span class="s">{summary[p]}</span></span>
                  <Icon name="chevron-right" size={20} />
                </button>
              </li>
            ))}
          </ul>
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
