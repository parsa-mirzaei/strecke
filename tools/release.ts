/**
 * Release tool for the Next channel (RELEASES.md). Dry run by default; `--yes` does it for real.
 *
 *   node tools/release.ts status
 *   node tools/release.ts deploy <X.Y.Z> [--yes]      gates, build, tag, publish into the Next repository
 *   node tools/release.ts rollback [--to vX.Y.Z] [--yes]   publish an earlier release's exact files again
 *
 * The Next repository holds built files only. Every deploy is one new commit on its `main`, tagged
 * `vX.Y.Z`, with a `release.json` naming the release that was live before it. A rollback copies the files
 * of an earlier tag into a new commit: history is never rewritten, nothing is deleted. Learner data is
 * not in any of this: it lives in each browser (IndexedDB) and no deploy or rollback touches it.
 *
 * The Next repository is `https://github.com/<owner>/strecke-next.git`, `<owner>` read from this
 * checkout's `origin`; `--repo <url>` overrides it. Nothing personal is written into this file.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const APP = join(ROOT, 'app');
const DIST = join(APP, 'dist-next');
const BUDGET_KB = 300;

interface Release { version: string; tag: string; source: string; builtAt: string; previous: string | null; rolledBackFrom?: string }

const args = process.argv.slice(2);
const cmd = args[0] ?? 'status';
const YES = args.includes('--yes');
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function run(bin: string, argv: string[], cwd = ROOT, env: Record<string, string> = {}): string {
  const r = spawnSync(bin, argv, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && bin === 'npx', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${bin} ${argv.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
}
const git = (argv: string[], cwd = ROOT) => run('git', argv, cwd);
const say = (s: string) => console.log(s);

function nextRepo(): string {
  const given = opt('--repo');
  if (given) return given;
  const origin = git(['remote', 'get-url', 'origin']);
  const m = /github\.com[/:]([^/]+)\//.exec(origin);
  if (!m) throw new Error('cannot read the owner from origin; pass --repo <url>');
  return `https://github.com/${m[1]}/strecke-next.git`;
}

function clone(): string {
  const dir = mkdtempSync(join(tmpdir(), 'strecke-next-'));
  git(['clone', '--quiet', nextRepo(), dir]);
  return dir;
}

function live(dir: string): Release | null {
  const p = join(dir, 'release.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Release) : null;
}
const tagsAt = (dir: string, ref = 'HEAD') => git(['tag', '--points-at', ref], dir).split('\n').filter(Boolean);

/** Compressed size of what the app ships (D44: JS + CSS + fonts + icons ≤ 300 KB). */
function shippedKB(dir: string): number {
  let bytes = 0;
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|css|html|webmanifest)$/.test(f)) bytes += gzipSync(readFileSync(p)).length;
      else if (/\.(woff2|png|svg)$/.test(f)) bytes += statSync(p).size;
    }
  };
  walk(dir);
  return Math.round(bytes / 1024);
}

function replaceTree(dir: string, from: string) {
  for (const f of readdirSync(dir)) if (f !== '.git') rmSync(join(dir, f), { recursive: true, force: true });
  cpSync(from, dir, { recursive: true });
}

const readme = (r: Release) => `# Strecke Next

Built files of the Strecke **Next** channel (new features before they reach the stable app). Release \`${r.tag}\`, built from commit \`${r.source.slice(0, 7)}\` of the \`strecke\` repository. Own storage namespace (\`strecke-next\`), own service-worker scope and cache prefix; it never reads or changes the stable app's data.

Deployed and rolled back with \`tools/release.ts\` (see \`RELEASES.md\` in the source repository). Every release is a tag here; nothing is ever force-pushed.
`;

function publish(dir: string, message: string, tag: string | null) {
  writeFileSync(join(dir, '.nojekyll'), '');
  git(['add', '-A'], dir);
  say(git(['status', '--short'], dir) || '(no file changes)');
  if (!YES) { say('\nDry run: nothing committed, tagged or pushed. Add --yes to do it.'); return; }
  git(['commit', '--quiet', '-m', message], dir);
  if (tag) git(['tag', '-a', tag, '-m', message], dir);
  git(['push', '--quiet', 'origin', 'main'], dir);
  git(['push', '--quiet', 'origin', '--tags'], dir);
  say(`\nPublished: ${git(['rev-parse', '--short', 'HEAD'], dir)} on ${nextRepo()} (GitHub Pages updates within a few minutes).`);
}

function deploy(version: string | undefined) {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('usage: deploy <X.Y.Z> [--yes]');
  const tag = `v${version}`;
  if (git(['status', '--porcelain'])) throw new Error('the working tree has uncommitted changes; commit first');
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')) as { version: string };
  if (pkg.version !== version) throw new Error(`app/package.json says ${pkg.version}; set it to ${version} and commit first`);
  if (git(['tag', '--list', tag])) throw new Error(`tag ${tag} exists already here`);
  const source = git(['rev-parse', 'HEAD']);

  say(`Gates: typecheck and unit tests (root and app) …`);
  run('npx', ['tsc', '--noEmit']);
  run('npx', ['vitest', 'run']);
  run('npx', ['tsc', '--noEmit'], APP);
  run('npx', ['vitest', 'run'], APP);
  say('Build: Next channel …');
  rmSync(DIST, { recursive: true, force: true });
  run('npx', ['vite', 'build', '--outDir', 'dist-next'], APP, { VITE_NS: 'next' });
  const kb = shippedKB(DIST);
  if (kb > BUDGET_KB) throw new Error(`budget: ${kb} KB > ${BUDGET_KB} KB`);
  say(`Build ok: ${kb} KB compressed (budget ${BUDGET_KB} KB).`);
  run('bash', [join(ROOT, 'tools', 'privacy-audit.sh'), '--dist', DIST]);
  say('Privacy audit of the built files: clean.');

  const dir = clone();
  try {
    const before = live(dir);
    if (git(['tag', '--list', tag], dir)) throw new Error(`tag ${tag} exists already in the Next repository`);
    // The build that is live now must stay reachable by a tag; the first build before this tool had none.
    let previous = before?.tag ?? tagsAt(dir)[0] ?? null;
    if (!previous) {
      previous = `live-before-${tag}`;
      say(`The live build has no tag; it will be tagged ${previous} so it can be rolled back to.`);
      if (YES) { git(['tag', '-a', previous, '-m', `Build live before ${tag}`], dir); }
    }
    const rel: Release = { version, tag, source, builtAt: new Date().toISOString(), previous };
    replaceTree(dir, DIST);
    writeFileSync(join(dir, 'release.json'), `${JSON.stringify(rel, null, 2)}\n`);
    writeFileSync(join(dir, 'README.md'), readme(rel));
    say(`\nDeploy ${tag} (source ${source.slice(0, 7)}), previous live: ${previous}`);
    if (YES) git(['tag', '-a', tag, '-m', `Strecke Next ${tag}`]); // the source commit, in this checkout
    publish(dir, `Strecke Next ${tag} from ${source.slice(0, 7)}`, tag);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function rollback() {
  const dir = clone();
  try {
    const now = live(dir);
    const current = now?.tag ?? tagsAt(dir)[0] ?? git(['rev-parse', '--short', 'HEAD'], dir);
    const to = opt('--to') ?? now?.previous;
    if (!to) throw new Error('no previous release recorded; pass --to <tag>');
    if (!git(['tag', '--list', to], dir)) throw new Error(`no tag ${to} in the Next repository (tags: ${git(['tag'], dir).replace(/\n/g, ', ')})`);
    say(`Rollback: ${current} → ${to}`);
    for (const f of readdirSync(dir)) if (f !== '.git') rmSync(join(dir, f), { recursive: true, force: true });
    git(['checkout', to, '--', '.'], dir); // the exact files that tag published
    const old = live(dir);
    const rel: Release = { ...(old ?? { version: to.replace(/^v/, ''), tag: to, source: '', builtAt: '' }), previous: current, rolledBackFrom: current };
    writeFileSync(join(dir, 'release.json'), `${JSON.stringify(rel, null, 2)}\n`);
    publish(dir, `Rollback to ${to} (was ${current})`, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function status() {
  const dir = clone();
  try {
    say(`Next repository: ${nextRepo()}`);
    say(`Live: ${JSON.stringify(live(dir) ?? { tag: tagsAt(dir)[0] ?? '(untagged)', commit: git(['rev-parse', '--short', 'HEAD'], dir) })}`);
    say(`Tags: ${git(['tag'], dir).replace(/\n/g, ', ') || '(none)'}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  if (cmd === 'deploy') deploy(args[1]);
  else if (cmd === 'rollback') rollback();
  else if (cmd === 'status') status();
  else throw new Error('commands: status | deploy <X.Y.Z> [--yes] | rollback [--to vX.Y.Z] [--yes]');
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
