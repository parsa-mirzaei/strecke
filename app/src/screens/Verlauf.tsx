import { dashboard, SECURE_STABILITY_DAYS, type HardItem } from '@core/engine/stats.ts';
import type { Ctx } from '../appctx';
import { t, type StringKey } from '../i18n';
import { Icon } from '../ui/Icon';

const MAX_SQUARES = 8;
const TOPICS = new Set(['arbeit', 'alltag', 'uni', 'amt', 'smalltalk']);
const day = (k: number) => t(`day.${k}` as StringKey);
const dayLong = (k: number) => t(`dayLong.${k}` as StringKey);

const label = (h: HardItem) => (h.kind === 'topic' ? (TOPICS.has(h.label) ? t(`topic.${h.label}` as StringKey) : h.label) : h.kind === 'word' ? h.label : t(`hard.${h.kind}` as StringKey));

function HardList({ items, onPractice }: { items: HardItem[]; onPractice: (ids: string[]) => void }) {
  return (
    <ul class="hard-list">
      {items.map((h) => (
        <li key={h.key}>
          <div><span class="nm" lang={h.kind === 'word' ? 'de' : undefined}>{label(h)}</span><br /><span class="ct">{t('verlauf.missed', { misses: h.misses, attempts: h.attempts })}</span></div>
          <button class="small-btn" type="button" onClick={() => onPractice(h.wordIds)}>{t('verlauf.practise')}</button>
        </li>
      ))}
    </ul>
  );
}

/** Verlauf: where you stand, with no pressure. Every number is recomputed from the event log. */
export function Verlauf({ ctx, onBack, onPractice }: { ctx: Ctx; onBack: () => void; onPractice: (ids: string[]) => void }) {
  const d = dashboard({ words: ctx.words, events: ctx.events, settings: ctx.settings, now: Date.now(), retention: ctx.config.retention });
  const total = Math.max(1, d.words.total);
  const pct = (n: number) => `${(n / total) * 100}%`;
  const maxRuns = Math.max(1, ...d.week.days.map((x) => x.runs));
  const squares = maxRuns <= MAX_SQUARES;
  const anyHard = d.hard.words.length + d.hard.kinds.length + d.hard.topics.length > 0;

  return (
    <>
      <header class="top">
        <div class="row">
          <button class="quiet" type="button" onClick={onBack}><Icon name="chevron-left" size={20} />{t('common.back')}</button>
          <span class="run">{t('verlauf.title')}</span>
        </div>
      </header>
      <div class="page enter">
        {d.empty ? (
          <div class="empty-card">
            <h2 class="sec-title">{t('verlauf.emptyTitle')}</h2>
            <p class="note" style={{ marginTop: '8px' }}>{t('verlauf.emptyText')}</p>
          </div>
        ) : null}

        <section aria-labelledby="h-today">
          <h2 class="sec-title" id="h-today">{t('sum.today')}</h2>
          <dl class="stats" style={{ marginTop: '10px' }}>
            <div><dt>{t('stat.runs')}</dt><dd>{d.today.runs}</dd></div>
            <div><dt>{t('stat.cards')}</dt><dd>{d.today.cards}</dd></div>
            <div class="sec"><dt>{t('stat.secured')}</dt><dd>{d.today.secured}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="h-week">
          <h2 class="sec-title" id="h-week">{t('verlauf.week')}</h2>
          <div class="chart" role="img" aria-label={t('verlauf.chartLabel', { list: d.week.days.map((x, k) => `${dayLong(k)} ${x.runs}`).join(', ') })}>
            {d.week.days.map((x, k) => (
              <div key={x.date} class={`day${k === d.week.todayIndex ? ' today' : ''}`}>
                {squares ? (
                  <div class="stackbars">{Array.from({ length: x.runs }, (_, j) => <i key={j} />)}</div>
                ) : (
                  <div class="bar">
                    {x.runs ? <em>{x.runs}</em> : null}
                    <i style={{ height: `${Math.max(x.runs ? 4 : 0, (x.runs / maxRuns) * 104)}px` }} />
                  </div>
                )}
                <span>{day(k)}</span>
              </div>
            ))}
          </div>
          {!squares ? <p class="note">{t('verlauf.bars')}</p> : null}
          <dl class="stats">
            <div><dt>{t('stat.runs')}</dt><dd>{d.week.runs}</dd></div>
            <div><dt>{t('stat.cards')}</dt><dd>{d.week.cards}</dd></div>
            <div class="sec"><dt>{t('stat.secured')}</dt><dd>{d.week.secured}</dd></div>
          </dl>
          {d.goal ? (
            <div style={{ marginTop: '16px' }}>
              <p class="note">{t('verlauf.goal', { done: d.goal.done, target: d.goal.target })}</p>
              <div class="dots" aria-hidden="true">{Array.from({ length: Math.min(d.goal.target, 14) }, (_, k) => <i key={k} class={k < d.goal!.done ? 'on' : ''} />)}</div>
            </div>
          ) : null}
        </section>

        {d.month.runs > d.week.runs ? (
          <section aria-labelledby="h-month">
            <h2 class="sec-title" id="h-month">{t('verlauf.month')}</h2>
            <dl class="stats" style={{ marginTop: '10px' }}>
              <div><dt>{t('stat.runs')}</dt><dd>{d.month.runs}</dd></div>
              <div><dt>{t('stat.cards')}</dt><dd>{d.month.cards}</dd></div>
              <div class="sec"><dt>{t('stat.secured')}</dt><dd>{d.month.secured}</dd></div>
            </dl>
          </section>
        ) : null}

        <section aria-labelledby="h-words">
          <h2 class="sec-title" id="h-words">{t('verlauf.words')}</h2>
          {d.words.total === 0 ? <p class="note" style={{ marginTop: '8px' }}>{t('verlauf.noWords')}</p> : (
            <>
              <div class="levels" role="img" aria-label={t('verlauf.levelsLabel', { new: d.words.new, learning: d.words.learning, secure: d.words.secure })}>
                <i class="l-new" style={{ width: pct(d.words.new) }} />
                <i class="l-learning" style={{ width: pct(d.words.learning) }} />
                <i class="l-secure" style={{ width: pct(d.words.secure) }} />
              </div>
              <ul class="legend">
                <li><span class="dot" style={{ background: 'var(--fog)', border: '1px solid var(--control)' }} /><b>{d.words.new}</b>{t('level.new')}</li>
                <li><span class="dot" style={{ background: 'var(--mid)' }} /><b>{d.words.learning}</b>{t('level.learning')}</li>
                <li><span class="dot" style={{ background: 'var(--teal)' }} /><b>{d.words.secure}</b>{t('level.secure')}</li>
              </ul>
              <p class="note" style={{ marginTop: '10px' }}>{t('verlauf.secureExplain', { weeks: Math.round(SECURE_STABILITY_DAYS / 7) })}</p>
            </>
          )}
        </section>

        <section aria-labelledby="h-hard">
          <h2 class="sec-title" id="h-hard">{t('verlauf.hard')}</h2>
          {!anyHard ? (
            <p class="note" style={{ marginTop: '8px' }}>{d.empty ? t('verlauf.hardWait') : t('verlauf.hardNone')}</p>
          ) : (
            <>
              <p class="note" style={{ marginTop: '8px' }}>{t('verlauf.hardIntro')}</p>
              {d.hard.words.length ? <><p class="kicker">{t('verlauf.hardWords')}</p><HardList items={d.hard.words} onPractice={onPractice} /></> : null}
              {d.hard.kinds.length ? <><p class="kicker">{t('verlauf.hardKinds')}</p><HardList items={d.hard.kinds} onPractice={onPractice} /></> : null}
              {d.hard.topics.length ? <><p class="kicker">{t('verlauf.hardTopics')}</p><HardList items={d.hard.topics} onPractice={onPractice} /></> : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}
