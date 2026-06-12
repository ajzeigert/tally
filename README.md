# tally

**Time tracking and invoicing from plain-text YAML timesheets.**

`tally` is a command-line tool for freelancers and consultants who'd rather keep their hours in a file they can read and edit, scoped to folders on their own machine. You track time with a built-in timer (or just type entries by hand), then generate a polished PDF or XLSX invoice for any billing period. Invoice history is kept centrally, so outstanding balances follow your clients across projects. There are about a million time tracking tools out there, but none of them worked exactly the way I wanted them to, so I added Yet Another. I almost called it YATT for Yet Another Time Tracker. Maybe I still will.

```
$ tally track start -d "Auth refactor"
Timer started: "Auth refactor"

$ tally track stop
Log 1.5h for "Auth refactor"? [y / d / corrected hours]: y
Tracked 1.5h (1h 27m 04s elapsed, rounded to 15min) — "Auth refactor"

$ tally invoice --period last-month
acme-co-7-month-2026-05-tally-invoice.pdf generated — Invoice #7
```

---

## Features

- **Plain-text timesheets** — each project gets a `tally.yml` you own and can edit by hand.
- **Built-in timer** — start/pause/resume/stop, live display, and backdating (`--ago`, `--since`).
- **Smart stop** — elapsed time is rounded to your configured increment, and you confirm or correct the hours before they're logged.
- **Two billing modes** — hourly `rate` or flat `fee` (with an optional hours breakdown).
- **Flexible periods** — `last-month`, `this-week`, a calendar month (`2026-05`), or an explicit date range.
- **Multi-repo invoices** — merge entries from several project directories into one invoice.
- **Centralized history** — sequential invoice numbers, paid/unpaid tracking, and automatic carry-forward of outstanding balances per client.
- **PDF or XLSX output** — PDFs render from a customizable HTML template.
- **Privacy-aware** — optionally adds timesheets and invoices to git's ignore list so billing details never get committed.

---

## Requirements

- **Node.js 18+** (developed on Node 22)
- **Chromium** for PDF rendering — installed via Playwright (see below). XLSX export needs no browser.

## Installation

```bash
# install the CLI globally
npm install -g @zeigert/tally

# install the chromium browser used for PDF rendering
npx playwright install chromium
```

This puts a `tally` command on your PATH. XLSX export works out of the box; the
`playwright install` step is only needed for PDF output.

### From source

```bash
git clone <repo-url> tally
cd tally
npm install
npx playwright install chromium
npm link
```

---

## Quick start

```bash
# 1. One-time setup: your details + a project timesheet
tally init

# 2. Track some time (writes entries into ./tally.yml)
tally track start -d "Initial setup"
tally track stop

# 3. See what you've logged
tally list

# 4. Generate an invoice for last month
tally invoice --period last-month
```

The first `tally init` walks you through a global config wizard (your name,
contact info, default rate, etc.), then creates a `tally.yml` for the current
project.

---

## Concepts

### Global config — `~/.config/tally/config.yml`

Your identity and defaults, shared across every project. Created by
`tally init` and editable with `tally config`.

```yaml
name: Jane Doe
email: jane@example.com
phone: 555-1234
location: Bend, OR
payment_terms: Net 30
rate: 125          # optional default hourly rate
rounding: 15       # minutes; how `track stop` rounds elapsed time (default 15)
git_exclude: repo  # global | repo | none — how tally files are kept out of git
```

### Timesheet — `tally.yml` (per project)

Lives in each project directory. Defines the client, billing mode, and the list
of work entries. Any of the global identity fields can be overridden here on a
per-client basis.

```yaml
client: Acme Co
mode: rate         # rate | fee
rate: 125          # required when mode is "rate"
# fee: 4000        # required when mode is "fee"

# Optional per-client overrides of global config:
# name: Jane Doe
# payment_terms: Net 15

entries:
  - date: 2026-05-03
    hours: 2.5
    description: Project kickoff and planning
  - date: 2026-05-04
    hours: 1.0
    description: Repo setup
```

### Invoice history — `~/.config/tally/history.yml`

Every generated invoice is recorded centrally with a sequential number, total,
status, and file path. Because history is global, outstanding (unpaid) invoices
for a client are automatically carried forward onto their next invoice. Manage
it with `tally history`.

### Invoice template — `~/.config/tally/template.html`

PDFs are rendered from an HTML template. The default is created on first run;
customize it with `tally template`. A `template.html` in the current directory
takes precedence over the global one, so individual projects can have their own
look.

---

## Commands

### Setup

| Command | Description |
| --- | --- |
| `tally init` | Run the global config wizard (first time) and create a `tally.yml` here. |
| `tally init --global` | Re-run only the global config wizard. |
| `tally config` | Open the global config in `$EDITOR`. |
| `tally edit` | Open this project's `tally.yml` in `$EDITOR`. |
| `tally reset` | Remove the global config and template (asks first). |

### Time tracking — `tally track <sub>`

The timer state is stored in a `.tally-tracking` file in the current directory.

| Command | Description |
| --- | --- |
| `tally track start -d "description"` | Start a timer. |
| `tally track start -d "..." --live` | Start with a live-updating elapsed display. |
| `tally track start -d "..." --ago 2h30m` | Start as if it began that long ago. |
| `tally track start -d "..." --since 9:30` | Start as if it began at that 24-hour time today. |
| `tally track pause` / `resume` | Pause or resume the running timer. |
| `tally track stop` | Round, confirm, and append an entry to `tally.yml`. |
| `tally track stop --no-confirm` | Skip the confirmation prompt. |
| `tally track status` (or `tally status`) | Show elapsed time on the current timer. |
| `tally track discard` | Cancel the timer without saving. |

**Stopping:** elapsed time is rounded up to your `rounding` increment (default 15
minutes), then you're asked to confirm. Answer `y` to log it, `d` to discard, or
type a corrected number of hours.

**Stale sessions:** if a timer is still open when you start a new one (e.g. you
forgot to stop yesterday), tally asks how many hours you actually worked and logs
them — backdated to when that timer started — before starting the new one.

### Viewing — `tally list`

Shows the current project's entries with totals, plus that client's invoice
history and outstanding balance.

### Invoicing — `tally invoice --period <p>`

| Flag | Description |
| --- | --- |
| `--period <p>` | **Required.** The billing period (see formats below). |
| `--dirs <path...>` | Merge entries from multiple project directories into one invoice. |
| `--format <pdf\|xlsx>` | Output format. Default `pdf`. |
| `--include-hours` / `--no-hours` | In `fee` mode, include or omit the hours breakdown (skips the prompt). |

**Period formats:**

```
last-month   this-month   last-week   this-week
2026-05                    (a full calendar month)
2026-05-01,2026-05-31      (an explicit date range)
```

If an invoice already exists for the same period and client, tally asks before
regenerating (and warns more loudly if it's already marked paid).

### Invoice history — `tally history <sub>`

| Command | Description |
| --- | --- |
| `tally history` | List all invoices across all clients, with outstanding total. |
| `tally history paid <n>` | Mark invoice #n paid (records the date). |
| `tally history unpaid <n>` | Mark invoice #n unpaid. |
| `tally history delete <n>` | Remove invoice #n from history (asks first). |
| `tally history edit <n> --total <amt>` | Override the stored total on invoice #n. |
| `tally history open` | Open the history file in `$EDITOR`. |

### Template — `tally template`

| Command | Description |
| --- | --- |
| `tally template` | Open the invoice HTML template in `$EDITOR`. |
| `tally template --reset` | Restore the default template. |

---

## File locations

| Path | What |
| --- | --- |
| `~/.config/tally/config.yml` | Global config (your details and defaults). |
| `~/.config/tally/history.yml` | Centralized invoice history. |
| `~/.config/tally/template.html` | Default invoice template. |
| `./tally.yml` | A project's timesheet. |
| `./template.html` | Optional per-project template override. |
| `./.tally-tracking` | Running-timer state (transient). |
| `./*-tally-invoice.pdf` / `.xlsx` | Generated invoices. |

## Privacy & git

Timesheets and invoices contain billing details you usually don't want in a
public repo. During setup tally offers to add its files
(`tally.yml`, `*-tally-invoice.pdf`, `*-tally-invoice.xlsx`, `.tally-tracking`)
to git's ignore list, in one of three ways:

- **global** — `~/.config/git/ignore`, applies to every repo on the machine.
- **repo** — prompts per project for `.git/info/exclude` (local, uncommitted) or `.gitignore` (committed).
- **none** — tally won't touch git at all.

`tally reset` removes the global ignore entries if you chose the global option.

---

## Development

```bash
npm test          # runs the node:test suite in test/*.test.js
```
