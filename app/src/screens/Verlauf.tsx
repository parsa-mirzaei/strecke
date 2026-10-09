import { dashboard, SECURE_STABILITY_DAYS, type HardItem } from '@core/engine/stats.ts';
import type { Ctx } from '../appctx';
import { DOMAIN_LABEL } from '../run/text';
import { Icon } from '../ui/Icon';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const KIND_NAME: Record<string, string> = {
  article: 'Artikel', plural: 'Mehrzahl', preposition: 'Präpositionen', collocation: 'Wortverbindungen', meaning: 'Bedeutungen',
  sentence: 'Wörter im Satz', recall: 'Neue Wörter merken',
};
const MAX_SQUARES = 8;
const MONTH = 'Letzte 30 Tage';

const label = (h: HardItem) => (h.kind === 'topic' ? DOMAIN_LABEL[h.label] ?? h.label : h.kind === 'word' ? h.label : KIND_NAME[h.kind] ?? h.label);

function HardList({ items, onPractice }: { items: HardItem[]; onPractice: (ids: string[]) => void }) {
  return (
    <ul class="hard-list">
      {items.map((h) => (
        <li key={h.key}>
          <div><span class="nm">{label(h)}</span><br /><span class="ct">{h.misses} von {h.attempts} Antworten daneben</span></div>
          <button class="small-btn" type="button" onClick={() => onPractice(h.wordIds)}>Diese üben</button>
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
          <button class="quiet" type="button" onClick={onBack}><Icon name="chevron-left" size={20} />Zurück</button>
          <span class="run">Verlauf</span>
        </div>
      </header>
      <div class="page enter">
        {d.empty ? (
          <div class="empty-card">
            <h2 class="sec-title">Noch leer.</h2>
            <p class="note" style={{ marginTop: '8px' }}>Nach deiner ersten Runde siehst du hier, wie viele Runden und Karten zusammenkommen. Kleine Runden zählen genauso wie lange, zum Beispiel in der Bahn.</p>
          </div>
        ) : null}

        <section aria-labelledby="h-today">
          <h2 class="sec-title" id="h-today">Heute</h2>
          <dl class="stats" style={{ marginTop: '10px' }}>
            <div><dt>Runden</dt><dd>{d.today.runs}</dd></div>
            <div><dt>Karten</dt><dd>{d.today.cards}</dd></div>
            <div class="sec"><dt>Wörter sicherer</dt><dd>{d.today.secured}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="h-week">
          <h2 class="sec-title" id="h-week">Diese Woche</h2>
          <div class="chart" role="img" aria-label={`Runden pro Tag: ${d.week.days.map((x, k) => `${DAYS_LONG[k]} ${x.runs}`).join(', ')}`}>
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
                <span>{DAYS[k]}</span>
              </div>
            ))}
          </div>
          {!squares ? <p class="note">Ein Kästchen pro Runde passt nicht mehr: die Säulen zeigen die Zahl der Runden.</p> : null}
          <dl class="stats">
            <div><dt>Runden</dt><dd>{d.week.runs}</dd></div>
            <div><dt>Karten</dt><dd>{d.week.cards}</dd></div>
            <div class="sec"><dt>Wörter sicherer</dt><dd>{d.week.secured}</dd></div>
          </dl>
          {d.goal ? (
            <div style={{ marginTop: '16px' }}>
              <p class="note">Dein Wochenziel: <b>{d.goal.done}</b> von {d.goal.target} Runden</p>
              <div class="dots" aria-hidden="true">{Array.from({ length: Math.min(d.goal.target, 14) }, (_, k) => <i key={k} class={k < d.goal!.done ? 'on' : ''} />)}</div>
            </div>
          ) : null}
        </section>

        {d.month.runs > d.week.runs ? (
          <section aria-labelledby="h-month">
            <h2 class="sec-title" id="h-month">{MONTH}</h2>
            <dl class="stats" style={{ marginTop: '10px' }}>
              <div><dt>Runden</dt><dd>{d.month.runs}</dd></div>
              <div><dt>Karten</dt><dd>{d.month.cards}</dd></div>
              <div class="sec"><dt>Wörter sicherer</dt><dd>{d.month.secured}</dd></div>
            </dl>
          </section>
        ) : null}

        <section aria-labelledby="h-words">
          <h2 class="sec-title" id="h-words">Deine Wörter</h2>
          {d.words.total === 0 ? <p class="note" style={{ marginTop: '8px' }}>Noch keine Wörter in deiner Liste.</p> : (
            <>
              <div class="levels" role="img" aria-label={`${d.words.new} neu, ${d.words.learning} im Lernen, ${d.words.secure} sicher`}>
                <i class="l-new" style={{ width: pct(d.words.new) }} />
                <i class="l-learning" style={{ width: pct(d.words.learning) }} />
                <i class="l-secure" style={{ width: pct(d.words.secure) }} />
              </div>
              <ul class="legend">
                <li><span class="dot" style={{ background: 'var(--fog)', border: '1px solid var(--control)' }} /><b>{d.words.new}</b>neu</li>
                <li><span class="dot" style={{ background: 'var(--mid)' }} /><b>{d.words.learning}</b>im Lernen</li>
                <li><span class="dot" style={{ background: 'var(--teal)' }} /><b>{d.words.secure}</b>sicher</li>
              </ul>
              <p class="note" style={{ marginTop: '10px' }}>Sicher heißt: Du erinnerst dich voraussichtlich mindestens {Math.round(SECURE_STABILITY_DAYS / 7)} Wochen lang. Das schätzt das Gedächtnismodell aus deinen Antworten; es sagt nichts über die Welt außerhalb der App.</p>
            </>
          )}
        </section>

        <section aria-labelledby="h-hard">
          <h2 class="sec-title" id="h-hard">Wo es noch hakt</h2>
          {!anyHard ? (
            <p class="note" style={{ marginTop: '8px' }}>{d.empty ? 'Das siehst du, sobald genug Antworten da sind.' : 'Bisher zeigt sich kein Muster. Mit mehr Antworten wird das hier aussagekräftiger.'}</p>
          ) : (
            <>
              <p class="note" style={{ marginTop: '8px' }}>Nur eine Auswahl aus deinen Antworten, kein Urteil. Du entscheidest, ob du etwas davon üben willst.</p>
              {d.hard.words.length ? <><p class="kicker">Wörter</p><HardList items={d.hard.words} onPractice={onPractice} /></> : null}
              {d.hard.kinds.length ? <><p class="kicker">Aufgabenarten</p><HardList items={d.hard.kinds} onPractice={onPractice} /></> : null}
              {d.hard.topics.length ? <><p class="kicker">Themen</p><HardList items={d.hard.topics} onPractice={onPractice} /></> : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}
