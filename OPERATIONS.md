# Operations Guide

## Quick Links (Workflows)

- **Seed** — one-time/adhoc import  
  https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/seed.yml
- **Ship Outbox** — packages and ships `data/outbox/` when present  
  https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/ship-outbox.yml
- **Nightly Maintenance** — related builder, topic refresh, bibliography, auto-commit  
  https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/cron-maintenance.yml
- **Backups** — nightly snapshot of `data/`  
  https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/backup.yml
- **Daily Discovery** — global search + gating; writes reports  
  https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/daily-discovery.yml
- **Cleanup & Dedupe DB** — removes dupes/stragglers; compacts IDs  
  https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/cleanup_dedupe.yml
- **Smoke: Generate Outbox** — creates a test outbox artifact (no shipping)  
  https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/smoke-outbox.yml

---

## Environment & Permissions

### Required repo secrets/vars
- `GOOGLE_API_KEY` — Google Programmable Search key
- `SEARCH_ENGINE_ID` — CSE ID

### Optional env
- `DISCOVERY_DATE_WINDOW` (default `d14`)
- `DISCOVERY_VERIFY` (`true`/`false`, default `true`)
- `DISCOVERY_LANG` (default `en`)
- `DISCOVERY_BLOCKLIST` (comma-separated hosts)

### GitHub permissions
For **cron-maintenance.yml** (auto-commit) ensure:
- **Settings → Actions → General → Workflow permissions:** _Read and write permissions_
- Or add `permissions: { contents: write }` inside that workflow (already present if you followed the template).

---

## Data Locations (ground truth)

- Master DB: `data/articles.json`
- Discovery outputs:
  - `data/new-articles-full.json` (array; empty when “Nothing new”)
  - `data/notification.md` (human report; will say “Nothing new today.” when appropriate)
  - `data/outbox/…` (only created **when** there are new/updated items)
- Backups: `backups/YYYY-MM-DD/` (nightly)

---

## Runbooks

### 1) Daily Discovery
**Trigger:** Scheduled, or run manually via the workflow.  
**What it does:** Queries the open web for byline matches, language + authorship gating, dedupes against `data/articles.json`.  
**Expected results:**
- Nothing new:  
  - `data/new-articles-full.json` → `[]`  
  - `data/notification.md` → contains “Nothing new today.”  
  - **No** `data/outbox/` is created.
- New/updated items:
  - `data/new-articles-full.json` contains entries
  - `data/notification.md` has New/Updates sections
  - `data/outbox/<archive/...>/*` generated for each new/update

**If new items exist**, run **Ship Outbox** next.

---

### 2) Ship Outbox
**Precondition:** `data/outbox/` exists (from discovery or smoke).  
**Trigger:** Manual or scheduled (if you’ve set it that way).  
**Output:** Ships/archives the outbox payload (see workflow logs for the destination) and uploads a run artifact.

---

### 3) Smoke: Generate Outbox
**Use:** Validate the outbox pipeline end-to-end without relying on fresh discovery results.  
**Result:** Produces a `smoke-outbox` artifact; won’t email/ship production payloads.

---

### 4) Cleanup & Dedupe DB
**Use:** After bulk imports or when you suspect duplicates.  
**Result:** `data/articles.json` deduped; IDs made contiguous; non-article/blocked domains removed.

**Post-checks:**
- Count equals expected corpus
- No Indonesian/topic-index pages
- IDs sequential (no gaps)

---

### 5) Nightly Maintenance
**What it runs (scripts/):**
- `build-related.js` — rebuilds related-articles indices
- (optionally) topic-page refresh, bibliography position fix, and any other site-maintenance tasks you’ve added

**Requirements:**
- Workflow has `contents: write`
- The scripts above are committed in `scripts/`

**Result:** Changes auto-committed to `main` (see run logs).

---

### 6) Backups
**When:** Nightly  
**What:** Copies `data/` into `backups/YYYY-MM-DD/`

**Restore:** See the README “Backup & Restore” section.

---

## Troubleshooting

- **MODULE_NOT_FOUND** during Nightly Maintenance  
  Ensure all referenced scripts (e.g., `scripts/build-related.js`) are committed to the repo.

- **No `data/outbox/` after a successful discovery**  
  That’s expected when there are no new/updated items. Outbox is only created when there’s something to ship.

- **Auto-commit fails in cron-maintenance**  
  Check repo **Workflow permissions** (must be read/write) or add `permissions: contents: write` to the workflow.

- **Discovery finds topic/index pages**  
  Add host/path patterns to `DISCOVERY_BLOCKLIST` or extend the `isKnownNonArticleUrl()` filter in `src/discovery.js`.

---

## Local (optional)
If you want to sanity-check scripts locally:

```bash
# Node 20+
node -v

# Discovery (won’t write outbox when nothing new)
GOOGLE_API_KEY=... SEARCH_ENGINE_ID=... \
DISCOVERY_DATE_WINDOW=d30 \
node src/discovery.js

# Maintenance tasks (example)
node scripts/build-related.js
