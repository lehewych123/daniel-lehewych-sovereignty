# daniel-lehewych-sovereignty

## Backup & Restore

### Automatic Backups
This repository automatically backs up the `data/` folder nightly at 11:17 PM ET.

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
