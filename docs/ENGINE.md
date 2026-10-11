# Engine notes (Round 4)

The engine rules are in [SPEC "Exercises" and "Learning engine"](SPEC.md) and DECISIONS D39–D41 and D48. This page records what Round 4 changed and what the simulator shows.

## Changes in Round 4

- **Karte self-report (D52).** After the cover lifts, the learner picks *Didn't know / Partly / Knew it / Instantly* (rising-bars icons). The pick is stored on the `seen` event as `rating` (FSRS 1–4) and sets the word's memory.
  - *Instantly* on a new word starts it at stage 2.
  - *Knew it* and *Instantly* skip the same-visit recall.
  - Graded exercises still rate from behaviour only.
- **Distractor form agreement (D55)** for Lücke and Zweiter Kontext, in `formSlot` and `formOptions` (`core/src/exercises.ts`). Every option must fill the same inflectional slot as the answer:
  - **Verbs.** Infinitive with infinitive (including the zu-infinitive of separable verbs). Participle with participle: *ge-* forms, or *-t/-en* forms of inseparable or *-ieren* verbs when the sentence has an auxiliary (*habe, ist, wird, …*). A conjugated form only with the same ending: *-e, -st, -t, -en*. So the known bad case *Ich ___ dir das Geld morgen* offers *überweise* only with other *-e* forms; *beschwert* and *ausfüllen* are excluded.
  - **Nouns.** The same number. When a determiner shows gender before the gap (optionally followed by up to two inflected adjectives, as in *an der nächsten ___*), the same gender too. *dem/einem/am/im/zum/vom/beim* accept masculine and neuter. Plurals match any gender.
  - **Adjectives.** The same ending: none, *-e, -en, -er, -es, -em*.
  - **Phrases.** Other phrases, as before.
  - **Candidates** come from other records' example forms and dictionary forms, same part of speech, same tier first.
  - **Too few candidates.** With one fitting form the exercise has two options. With none it is not generated.
- **Stand-in gate (D55).** If a record's gate exercise cannot be built on this deck, the next exercise in the gate's fallback chain stands in (`effectiveGate`). Its event carries `gate: true`, so a replay promotes exactly as the live session did, and still never looks at other words. This also resolves the D48 known limit: "a part of speech with fewer than three words … stays at the stage before that gate".

## Simulator

`node --experimental-strip-types tools/simulate.ts [--words 60,300] [--days 60] [--cards 30] [--seed 7]` runs the real scheduler and generator against a synthetic learner. It also checks that replaying the log reproduces every state.

**The synthetic learner is an assumption, not data.** Each word has a hidden "true" memory that follows FSRS-5 with a per-word difficulty. The chance of recall is the current retrievability adjusted per exercise (recognition easier, typing harder). The learner practises every day: two visits, 15 cards each. Real learners skip days, guess and get tired.

The brief asked for this report "under the chosen c0 design" and for the share of "reorder" cards. Neither a c0 design nor a reorder exercise exists in this repository, so the report covers the current engine (D41 + D55) and lists reorder as absent.

### Results (seed 7, 60 days, 30 cards a day)

| Exercise | 60 words: all cards | 60 words: stage ≥ 3 | 300 words: all cards | 300 words: stage ≥ 3 |
| --- | --- | --- | --- | --- |
| Karte | 2.9 % | 0.0 % | 2.8 % | 0.0 % |
| Artikel | 8.2 % | 6.4 % | 5.7 % | 7.2 % |
| Bedeutung | 11.8 % | 12.9 % | 17.6 % | 14.5 % |
| Lücke | 38.4 % | 2.8 % | 40.5 % | 2.6 % |
| Präposition | 0.8 % | 1.7 % | 0.9 % | 1.8 % |
| Hören | 14.3 % | 16.3 % | 12.6 % | 16.4 % |
| **Tippen** (typed, production) | 16.2 % | **41.3 %** | 13.4 % | **38.7 %** |
| Zweiter Kontext | 7.3 % | 18.7 % | 6.5 % | 18.8 % |
| Reorder | not in this engine | | | |

| | 60 words | 300 words |
| --- | --- | --- |
| Secure (stage 5) by day 30 | 19 | 20 |
| Secure by day 60 | 29 | 25 |
| Introduced by day 60 | 52 | 51 |

Seed 11 gives the same picture: a production share of 38–41 % past the building stage.

**Reading:**
- The production share for words past the building stage (stage ≥ 3) is about **39–41 %**, well above the ~15 % threshold in the brief. No fix is proposed.
- The synthetic deck is rich (two examples for every word), so it needed no stand-in gates. A thin real sheet will show fewer Lücke and Tippen cards.
- **Finding to discuss.** Only about 51–52 words are introduced in 60 days at 30 cards a day, whatever the deck size. The picker serves due words before new ones (SPEC "Picking the next card", step 2 before step 3), and a growing review load leaves little room for the 5 new words a day.
  - This is the specified behaviour, not a bug. It is why the secure counts are similar for 60 and 300 words.
  - If a faster pace is wanted, the lever is a guaranteed new-word slot (for example one in every N cards while below `new_per_day`). That is a scheduler decision for the owner and is not changed here.
