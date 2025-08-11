# Operations Guide — Sovereignty System

This repo automates discovery, enrichment, and shipping of Daniel’s published work.

---

## Quick map

- **Discovery (daily / manual)** → writes:
  - `data/new-articles-full.json` (full metadata of new/updated)
  - `data/notification.md` (human report)
  - `data/outbox/**` (only when there’s something new/updated)
- **Shipper (manual / on-demand)** → packages `data/outbox/**` and uses `data/notification.md`
- **Maintenance (nightly)** → rebuilds bibliography, related links, topic pages; auto-commits if changed
- **Utilities** → cleanup & dedupe DB; smoke test for outbox

> Note: When there are **no new items**, `data/outbox/` is **not created**. That’s expected.

---

## Prerequisites

- Node 20+ if running locally (`node -v`).
- GitHub repo **Secrets**:
  - `GOOGLE_API_KEY`
  - `SEARCH_ENGINE_ID`
- No extra token needed for nightly auto-commits (uses GitHub’s built-in `GITHUB_TOKEN`).

---

## Normal daily use (no action required)

- The Discovery workflow runs on schedule.
- If **nothing new**, you’ll see “Nothing new today.” in `data/notification.md`.
- If **new/updated** exists:
  - `data/new-articles-full.json` gains entries
  - `data/outbox/<archive/...>/*` appears (per-article bundles)
  - `data/notification.md` lists what changed

---

## Manually run things (GitHub UI)

1. **Run Discovery now**
   - GitHub → **Actions** → **Discovery** → **Run workflow**
   - Check artifacts/commit or open the repo to view:
     - `data/new-articles-full.json`
     - `data/notification.md`
     - `data/outbox/**` (only if there are new/updated)

2. **Generate Outbox (Smoke)**
   - GitHub → **Actions** → **Smoke: Generate Outbox** → **Run workflow**
   - Download the `smoke-outbox` artifact to inspect output structure.

3. **Ship Outbox**
   - GitHub → **Actions** → **Outbox Shipper** → **Run workflow**
   - This packages `data/outbox/**` and uses `data/notification.md`.
   - Review the workflow logs and artifacts to confirm what would be (or was) shipped.

4. **Nightly Maintenance (on demand)**
   - GitHub → **Actions** → **Nightly Maintenance** → **Run workflow**
   - It runs (in order):
     - `node scripts/build-bibliography.js`
     - `node scripts/build-related.js`
     - `node scripts/build-topics.js`
   - If files changed, the workflow auto-commits them to the default branch.

5. **Cleanup & Dedupe DB**
   - GitHub → **Actions** → **Cleanup & Dedupe DB** → **Run workflow**
   - Ensures IDs are contiguous and removes known dupes/stragglers.

---

## Run locally (optional)

From repo root:

```bash
# 0) Make sure Node 20+ is installed
node -v

# 1) Set env (macOS/Linux example)
export GOOGLE_API_KEY="..."; export SEARCH_ENGINE_ID="..."

# 2) Discovery (date window optional: d7, d14, d30, y1, y5)
DISCOVERY_DATE_WINDOW=d14 node src/discovery.js

# 3) Maintenance scripts
node scripts/build-bibliography.js
node scripts/build-related.js
node scripts/build-topics.js
