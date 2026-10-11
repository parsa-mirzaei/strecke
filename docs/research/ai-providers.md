# AI providers: deep links and scheduled tasks (for "Fill my list")

Researched on 2026-10-11 for Round 4, slice 4 (DECISIONS D58). Provider features change often; re-check these pages before relying on them.

**How the facts were checked.** The build environment could fetch `support.claude.com` directly; those pages were read in full. `help.openai.com` and the Google help pages were blocked by the environment's network policy, so their facts come from search-engine summaries of those official pages. They are marked *(summary)* below. Community posts are cited only to say what is *not* official.

## Prefilled prompts ("Generate now")

| Provider | What is documented | Used by Strecke |
| --- | --- | --- |
| Claude, desktop app | `claude://claude.ai/new?q=…` opens a new chat with the prompt field prefilled for review. Values must be URL-encoded; `q` is truncated to roughly 14 000 characters. [Open Claude Desktop with a link](https://support.claude.com/en/articles/14729294) | No: desktop only, and the learner is on an Android phone |
| Claude, mobile apps (iOS/Android) | `claude://` links and `https://claude.ai/code/…` universal links exist for **Claude Code** only, and they need Claude Code access. Chat prefill on mobile is not documented. [Open the Claude mobile app with a link](https://support.claude.com/en/articles/14898120) | No |
| Claude, web (`claude.ai/new?q=`) | Not documented. Public bug reports say it stopped working in 2025 ([anthropics/claude-code#8827](https://github.com/anthropics/claude-code/issues/8827)) | No |
| ChatGPT, web (`chatgpt.com/?q=`) | Not documented by OpenAI. Community posts describe it, with changing behaviour ([forum](https://community.openai.com/t/query-parameters-in-chatgpt/1027747)), and a 2025 security advisory says it auto-submitted ([Tenable TRA-2025-22](https://www.tenable.com/security/research/tra-2025-22)). Community feature requests say the Android app does not read it | No |

**Decision.** For Claude and ChatGPT, *Generate now* **always copies the text to the clipboard** and says so, then opens the provider's home page in a new tab (`https://claude.ai/new`, `https://chatgpt.com/`). For other providers it only copies.

Whether an installed Android app catches those `https` links (Android App Links) is not documented by either provider. Only the phone can show it.

A prefilled link would also hit length limits: the default instructions are about 4–5 KB of text, far beyond comfortable URL length, so copying is needed anyway.

## Scheduled tasks

### Claude

Source: [Schedule recurring tasks in Claude Cowork](https://support.claude.com/en/articles/13854387), read in full.

- **Plans.** Scheduled tasks are available on all paid plans: Pro, Max, Team, Enterprise. Not on Free.
- **Where they run.** They run remotely, "even when your computer is asleep or the Claude Desktop app is closed". Upcoming and past runs are listed under "Scheduled" in the left sidebar.
- **How to create one:**
  - In Cowork: Scheduled › New task › *Create with Claude* or *Set up manually*.
  - Fields: name, prompt, **approval mode**, frequency (hourly, daily, weekly, on weekdays, or manually), optional model, optional folder.
  - In the new experience: describe the task and how often in any chat, then click "Schedule".
- **Connectors.** Tasks "work with your connectors".

Source: [Use Google Workspace connectors](https://support.claude.com/en/articles/10166901), read in full.

- **Sheets editing.** This is a **beta**, with separate Google Docs, Sheets and Slides connectors next to Google Drive. Files are edited live in a pane beside the chat on the web and in Desktop.
- **Google Drive connector.** It searches, reads (including Sheets), uploads, creates folders, and shares/moves/trashes files. By default Claude asks for approval before share, move and trash actions.
- **Setup.** Turn the connectors on via the + button in a chat › Connectors.

**Not documented:**
- whether a *scheduled* task can append rows through the Sheets connector without a human approving each write;
- how the approval mode interacts with that.

This project's Phase 0 (DECISIONS D21) saw an unattended Claude cloud routine append rows to a test sheet through a Sheets connector. That was a different product surface (Claude Code routines) in October 2026, so it is evidence, not a guarantee. The app's guide says: run once by hand, check the approval setting, and look at the first scheduled run.

### ChatGPT

Sources: [Scheduled tasks in ChatGPT](https://help.openai.com/en/articles/10291617) *(summary)*; [Google Drive app and setup in ChatGPT](https://help.openai.com/en/articles/10929079) *(summary)*; [Connected apps in ChatGPT](https://help.openai.com/en/articles/11487775) *(summary)*.

- **Active-task caps:** 3 on Free and Go, 5 on Plus, 10 on Business and Edu, 15 on Pro and Enterprise.
- **Free plan:** one-time tasks, or recurring tasks at most once a day, in flexible time windows. Hourly schedules and exact times need an eligible paid plan.
- **Unsupported:** voice chats and GPTs.
- **Managing tasks:** on the "Scheduled" page (pause, resume, edit, delete). It may not appear in the desktop app.
- **Google Drive app.** The standalone Docs/Sheets/Slides apps were folded into it. "Where supported", it can create or edit native Google Sheets once connected with write scopes, and it may ask to confirm an action.
- **Not confirmed by OpenAI's help:**
  - whether an ordinary scheduled task can use the Google Drive app to write rows;
  - how a task is created step by step. The help says you ask ChatGPT for the action and set the schedule.

  The app says this plainly and suggests *Generate now* by hand, or Claude, if the first scheduled run cannot write.

### Both providers

- Only the learner can create a schedule, in their own account. The app cannot, and it never connects to an AI account (D49).
- Scheduled runs count against the provider's usage limits, which the providers set and may change.
