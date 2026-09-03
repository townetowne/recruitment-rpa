# Recruitment RPA

BOSS-first recruitment automation for people who want a ranked job shortlist with evidence, not a blind auto-apply bot.

## One-Minute Positioning

`recruitment-rpa` is the browser execution layer:

- It installs as a local Chrome extension.
- It reads BOSS Zhipin pages from the Chrome tab where you are already logged in.
- It collects complete JD text, job links, city evidence, and contact status.
- It writes JSONL checkpoints for every run.
- It hands the clean candidates to `career-ops-cn` for scoring, ranking, and review files.

`career-ops-cn` is the scoring and career profile layer:

- It owns the candidate pool, profile config, scoring logic, dedupe, P0/P1/P2 ranking, and review markdown.
- It is required for `npm run boss:collect-score`.
- `npm run setup:career-ops` copies the bundled clean `career-ops-cn` lite template into a sibling directory.
- A full personal `career-ops-cn` can also be passed with `--career-ops-root`.
- Do not publish your private local `career-ops-cn` data directory, resume, cookies, profile, or run outputs.

## Empty-Machine Quick Start

See [QUICKSTART.zh-CN.md](QUICKSTART.zh-CN.md) for the full beginner flow.

The short version is:

```text
Download ZIP:
https://codeload.github.com/townetowne/recruitment-rpa/zip/refs/heads/main
```

Then unzip and enter the project directory:

```bash
cd recruitment-rpa-main
npm run setup:career-ops
```

Then:

1. Install the Chrome extension from `chrome-extension`.
2. Log in to BOSS Zhipin in Chrome.
3. Optionally edit `../career-ops-cn/config/profile.yml` for your real profile.
4. Run:

```bash
npm run boss:collect-score -- --query "AI 架构师" --city 武汉 --target 50 --limit 50 --threshold 4
```

The main human-readable output is:

```text
../career-ops-cn/data/boss-review.md
```

## Current Scope

- BOSS Zhipin (`www.zhipin.com`) is the only runtime-enabled job site.
- Liepin and LinkedIn are adapter slots, not production runtime integrations yet.
- The current production-ready flow is read-only job discovery and local scoring.
- Real message sending, applying, or resume upload must stay behind an explicit review and approval gate.

## Execution Boundary

Allowed execution primitives:

- site API calls
- page-context fetch through the injected bridge
- semantic DOM contract queries
- extension messages
- local runner dispatch
- file input upload
- JSONL checkpoints

Forbidden execution primitives:

- screenshots
- screen OCR
- coordinate clicks
- coordinate navigation
- OS pointer clicks
- browser visual snapshots

## Architecture

```text
Chrome logged in to BOSS
        ↓
Genesis Recruitment RPA Chrome extension
        ↓
background service worker selects the BOSS tab and polls the local runner
        ↓
content script reads DOM contracts and contact-state evidence
        ↓
injected bridge runs same-page window.fetch when first-party context is required
        ↓
local runner dispatches tasks and receives structured results
        ↓
collectBossJobs applies city, complete-JD, contact-state, and checkpoint gates
        ↓
career-ops-cn scores, deduplicates, ranks, and creates review files
```

## JSONL Evidence

Every collection run writes a checkpoint file under:

```text
$HOME/.codex/state/recruitment-rpa/
```

Records include stage-level steps and per-job decisions such as `verified` or `skipped`. The audit layer rejects screenshots, raw DOM, coordinate evidence, cookies, tokens, passwords, and similar sensitive fields.

## Safety Model

- The user performs login, SMS, CAPTCHA, and security verification.
- The tool does not export cookies.
- The tool does not bypass platform risk controls.
- The tool does not auto-submit applications.
- Side effects must require a stable action id, a review artifact, explicit user approval, and postcondition verification.

## Test

```bash
npm test
```

## License

MIT
