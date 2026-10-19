import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AI_HOMES, buildInstructions, FILL_COUNT } from '@core/sheet/instructions.ts';
import type { Ctx } from '../appctx';
import { t } from '../i18n';
import { Icon } from '../ui/Icon';

/**
 * Settings › Fill my list (PORT_MAP feature D; DECISIONS R5-4). The app writes a text for the learner's
 * OWN AI assistant from the sheet's actual columns. "Generate now" always copies it first, then offers the
 * assistants' home pages. The app calls no AI service, writes nothing to the sheet and creates no schedule.
 */
interface FillPrefs { level: string; count: number; topic: string }
const KEY = 'strecke.fill.v1';
const STEP = 5;
const DEFAULTS: FillPrefs = { level: '', count: FILL_COUNT.default, topic: '' };

async function copy(text: string, box: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!box) return false;
    box.focus();
    box.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

export function FillMyList({ ctx }: { ctx: Ctx }) {
  const [p, setP] = useState<FillPrefs>(DEFAULTS);
  const [custom, setCustom] = useState<string | null>(null);
  const [copied, setCopied] = useState<'' | 'ok' | 'failed'>('');
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { void ctx.app.kv.get<FillPrefs>(KEY).then((v) => v && setP({ ...DEFAULTS, ...v })); }, []);
  const update = (next: Partial<FillPrefs>) => {
    const v = { ...p, ...next };
    setP(v);
    setCustom(null); // a changed field regenerates the text
    setCopied('');
    void ctx.app.kv.set(KEY, v);
  };

  const header = ctx.adapter.kind === 'sheet' ? ctx.sourceInfo?.header ?? null : null;
  const inboxHeader = ctx.sourceInfo?.inbox?.ok ? ctx.sourceInfo.inbox.header ?? null : null;
  const built = useMemo(() => buildInstructions({ header, inboxHeader, level: p.level, count: p.count, topic: p.topic }), [header, inboxHeader, p]);
  const text = custom ?? built.text;

  async function generate() {
    setCopied((await copy(text, box.current)) ? 'ok' : 'failed');
  }

  return (
    <>
      <p class="note">{t('fill.intro')}</p>
      <p class="note">{header ? t('fill.fromSheet', { n: built.headers.length }) : t('fill.fromTemplate', { n: built.headers.length })}</p>

      <label class="field" style={{ display: 'block' }}>
        <div class="lbl" style={{ marginBottom: '8px' }}>{t('fill.level')}<small>{t('fill.levelNote')}</small></div>
        <input class="text-in" type="text" autocomplete="off" value={p.level} placeholder={t('fill.levelPlaceholder')} onInput={(e) => update({ level: (e.currentTarget as HTMLInputElement).value })} />
      </label>
      <div class="field">
        <div class="lbl">{t('fill.count')}</div>
        <div class="stepper" role="group" aria-label={t('fill.count')}>
          <button type="button" aria-label={t('stepper.down')} disabled={p.count <= STEP} onClick={() => update({ count: Math.max(STEP, p.count - STEP) })}>−</button>
          <output>{p.count}</output>
          <button type="button" aria-label={t('stepper.up')} disabled={p.count >= FILL_COUNT.max} onClick={() => update({ count: Math.min(FILL_COUNT.max, p.count + STEP) })}>+</button>
        </div>
      </div>
      <label class="field" style={{ display: 'block' }}>
        <div class="lbl" style={{ marginBottom: '8px' }}>{t('fill.topic')}<small>{t('fill.topicNote')}</small></div>
        <input class="text-in" type="text" autocomplete="off" value={p.topic} placeholder={t('fill.topicPlaceholder')} onInput={(e) => update({ topic: (e.currentTarget as HTMLInputElement).value })} />
      </label>

      <p class="kicker">{t('fill.text')}</p>
      <textarea ref={box} class="text-in prompt-out" spellcheck={false} aria-label={t('fill.text')} value={text} onInput={(e) => { setCustom((e.currentTarget as HTMLTextAreaElement).value); setCopied(''); }} />
      {custom !== null ? <div class="btn-row"><button class="small-btn" type="button" onClick={() => setCustom(null)}><Icon name="rotate-ccw" size={18} />{t('fill.resetText')}</button></div> : null}
      <div class="btn-row"><button class="small-btn solid" type="button" onClick={() => void generate()}>{t('fill.generate')}</button></div>
      {copied === 'failed' ? <p class="note" role="status">{t('fill.copyFailed')}</p> : null}
      {copied === 'ok' ? (
        <div class="hint-box" role="status">
          <p class="note"><b>{t('fill.copied')}</b> {t('fill.openOne')}</p>
          <div class="btn-row">
            {AI_HOMES.map((a) => <a key={a.url} class="small-btn" href={a.url} target="_blank" rel="noopener noreferrer">{a.name}</a>)}
          </div>
          <p class="note">{t('fill.thenPaste')}</p>
        </div>
      ) : null}
      <p class="note" style={{ marginTop: '14px' }}>{t('fill.schedule')}</p>
    </>
  );
}
