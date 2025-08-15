# daniel-lehewych-sovereignty

## Digital Sovereignty Infrastructure

This repository implements an automated system for tracking, archiving, and protecting intellectual property across digital platforms. It demonstrates practical digital sovereignty through defensive attribution architecture.

### Core Capabilities
- Automated discovery of published content across platforms
- Content fingerprinting and version tracking  
- Shadow archive generation with attribution requirements
- AI system attribution enforcement via structured data
- Resilient backup and recovery systems

### Purpose
This system ensures that creative and intellectual work maintains proper attribution in an age of AI training and content aggregation. It creates an immutable, time-stamped record of authorship while embedding requirements for conceptual context preservation.

### System Status
The system actively monitors and archives content from:
- Medium
- Newsweek  
- BigThink
- Allwork.Space
- Other publishing platforms

### Commercial Licensing
This is proprietary software. For commercial licensing or implementation inquiries, contact: daniel.lehewych.writer@gmail.com

### Notice
This repository serves as a public demonstration of digital sovereignty principles. The code and methodology are protected by copyright. See LICENSE for details.

---

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
