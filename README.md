# daniel-lehewych-sovereignty

## Build & Ops Status

[![Daily Discovery](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/daily-discovery.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/daily-discovery.yml)
[![Smoke: Generate Outbox](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/smoke-outbox.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/smoke-outbox.yml)
[![Ship Outbox](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/ship-outbox.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/ship-outbox.yml)
[![Nightly Maintenance](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/cron-maintenance.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/cron-maintenance.yml)
[![Cleanup & Dedupe DB](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/cleanup_dedupe.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/cleanup_dedupe.yml)
[![Backups](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/backup.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/backup.yml)
[![Seed](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/seed.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/seed.yml)

---

## Backup & Restore

### Automatic Backups
This repository automatically backs up the `data/` folder nightly at **11:17 PM ET**.

### How to Restore from Backup

If you need to restore data from a backup:

```bash
# List available backups
ls -1 backups/

# Restore from a specific date (replace YYYY-MM-DD with actual date)
git pull
rm -rf data
cp -r backups/YYYY-MM-DD data
git add data
git commit -m "restore: data from YYYY-MM-DD"
git push
