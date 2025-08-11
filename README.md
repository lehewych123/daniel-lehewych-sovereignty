# daniel-lehewych-sovereignty

## Build & Ops Status

[![Discovery](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/discovery.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/discovery.yml)
[![Smoke: Generate Outbox](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/smoke-outbox.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/smoke-outbox.yml)
[![Outbox Shipper](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/outbox-shipper.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/outbox-shipper.yml)
[![Nightly Maintenance](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/nightly.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/nightly.yml)
[![Cleanup & Dedupe DB](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/cleanup-dedupe.yml/badge.svg?branch=main)](https://github.com/lehewych123/daniel-lehewych-sovereignty/actions/workflows/cleanup-dedupe.yml)

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

