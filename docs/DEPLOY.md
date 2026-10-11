# Deployment: live and preview

| Channel | Build | Storage namespace | Where |
| --- | --- | --- | --- |
| Live | `npm run build` in `app/` → `app/dist` | IndexedDB `strecke`, localStorage `strecke.*`, SW cache `strecke-*` | GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main` |
| Preview | `npm run build:preview` in `app/` → `app/dist-preview` | IndexedDB `strecke-preview`, localStorage `strecke-preview.*`, SW cache `strecke-preview-*`, manifest "Strecke Preview" | Built by `.github/workflows/preview.yml` on every push to a `claude/**` or `preview/**` branch, attached to the run as the artifact `strecke-preview` |

Because the namespaces differ, the preview and the live app can be installed on the same phone without sharing or overwriting data, even when served from the same origin (DECISIONS D57).

## Why the preview has no URL yet

GitHub Pages serves exactly one site per repository, and this repository's site is deployed from `main`. The Round 4 brief rules out both touching the live site and pushing to `main`. So no workflow on a work branch can publish the preview at its own address. A branch deploy would either be refused by the `github-pages` environment's branch rule or would replace the live site.

## Giving the preview its own URL (one owner decision, pick one)

1. **Subfolder of the same site (recommended).** Merge one change to `pages.yml` that builds `main` into the site root and the `preview` branch into `/preview/`, and allow the `preview` branch in the `github-pages` environment. Settings › Environments › github-pages › Deployment branches.
   - Afterwards, each push to `preview` redeploys both the root and `/preview/`.
   - The live files are rebuilt from `main` unchanged.
2. **Separate repository.** Create an empty public repository (for example `strecke-preview`) with Pages enabled and give this repository a deploy key for it. The preview workflow then pushes `dist-preview` there. This needs a secret, which the owner creates.
3. **No hosting.** Download the `strecke-preview` artifact from the workflow run and open it locally (`npx vite preview --outDir dist-preview` in `app/`). This is enough for desktop checks, but not for the phone.
