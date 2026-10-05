# Weekly routine configuration (Claude cloud routine)

Values verified by the security gate on 2026-10-05 ([GATE-REPORT.md](../docs/security/GATE-REPORT.md), tests L-4..L-8).

| Setting | Value | Why |
| --- | --- | --- |
| Connector | **Google Sheets only**, signed in as the learner's everyday ("connector") account | That account can open the Inbox and nothing of Strecke Core |
| Google Drive connector | **not attached** | Drive adds search, share, trash and copy of any file |
| Repository / sources | none | The agent needs no code; Phase 0 showed a routine running a script fetched from the repo |
| `allowed_tools` | `["TodoWrite"]` | An empty list is expanded to the full default preset (test L-8) |
| `disallowed_tools` | `Bash, Write, Edit, MultiEdit, Read, NotebookEdit, WebFetch, WebSearch, PushNotification, CronCreate, CronDelete, CronList, Agent, Task, SendMessage, Artifact, ArtifactData, ArtifactComments, Workflow, ScheduleWakeup, SendUserFile, Skill, DesignSync, EnterWorktree, ExitWorktree, Monitor, ReadNotifications, TaskCreate, TaskUpdate, TaskStop` | The deny list **is** enforced (test L-7) |
| `permitted_tools` on the Sheets connection | `["get_values", "append_values"]` | Documents intent only: **not enforced** by the platform today (tests L-4..L-6). Re-test after platform updates |
| Prompt | `Open spreadsheet <INBOX_ID>, read contract!A1:A30, follow it.` | Rules live in the protected contract tab |
| Schedule | weekly + manual "Run now"; early stop when nothing is needed | Proposal section 3, option D |
| Model | Sonnet | Subscription usage |

Worst case if this routine is hijacked: it can read and edit the Inbox's unprotected cells (agent columns of `inbox`) and copy Inbox data. Rows already imported are safe in Core `inbox_log`; Core itself is out of reach of this identity.
