# GitHub Backup Setup

This project includes:

- a DM-only `Run Backup Now` button in the Dungeon Master Area
- a secret-protected backup trigger endpoint that can be called by a separate backup repository or another scheduler

## Supabase function environment variables

Set these on the deployed `make-server-8a5950b5` edge function:

- `GITHUB_BACKUP_TOKEN`
- `GITHUB_BACKUP_OWNER`
- `GITHUB_BACKUP_REPO`
- `GITHUB_BACKUP_BRANCH` (optional, defaults to `main`)
- `GITHUB_BACKUP_BASE_PATH` (optional, defaults to `backups/inet`)
- `INET_BACKUP_TRIGGER_SECRET`

## External scheduler or backup repository

This project no longer includes a weekly workflow in the main repository.

If you want automatic weekly backups, create the scheduler in your separate backup repository or another external system and give it these secrets:

- `SITE_GITHUB_BACKUP_URL`
  - Example: `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-8a5950b5/dm/backups/github/run`
- `SUPABASE_PUBLISHABLE_KEY`
- `INET_BACKUP_TRIGGER_SECRET`

The external scheduler secret `INET_BACKUP_TRIGGER_SECRET` should have the same value as the Supabase function secret `INET_BACKUP_TRIGGER_SECRET`.

The scheduler should `POST` to `SITE_GITHUB_BACKUP_URL` with these headers:

- `Authorization: Bearer <SUPABASE_PUBLISHABLE_KEY>`
- `apikey: <SUPABASE_PUBLISHABLE_KEY>`
- `Content-Type: application/json`
- `X-Backup-Secret: <INET_BACKUP_TRIGGER_SECRET>`

And this JSON body:

```json
{"trigger":"weekly"}
```

## What gets backed up

The backup bundle currently includes:

- Personal Files data
- Wiki data
- News data
- Session Log data
- Campaign Timeline data

Backups are written to:

- `backups/inet/latest.json`
- `backups/inet/snapshots/YYYY-MM-DD/inet-backup-<timestamp>.json`

The base path can be changed with `GITHUB_BACKUP_BASE_PATH`.
