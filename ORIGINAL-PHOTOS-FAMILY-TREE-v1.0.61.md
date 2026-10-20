# MyFamily v1.0.61

This release adds a reusable private photo-archive architecture and a clearer family-tree presentation.

## Photo architecture

| Layer | Purpose | Location |
|---|---|---|
| Original | Archival-quality JPG, PNG or WebP, up to 20 MB | Private dedicated Google Drive folder |
| Display copy | Optimized image opened in the dashboard viewer | Same private Drive folder |
| Thumbnail | Fast card/avatar rendering | Dashboard data sheet |

Uploads use Google Drive resumable sessions in 768 KiB chunks. If an upload stops, `runAll()` or the next upload removes expired session records. Replacing/deleting a photo moves the superseded Drive file to Trash so recovery remains possible.

## Dedicated folders

- Family Memories
- Member Profile Photos
- Family Tree Photos
- Important Date Photos
- Parents Portrait
- Tradition Guide Photos
- Monthly Backups

## Family legacy gallery

Each saved Tradition Guide can hold 1–20 administrator-controlled photos. Every entry can store its caption, photo date and source/photographer. One photo is marked as the guide cover. Members with access to the related Reminder or Calendar module can view it; only administrators can upload, select the cover or delete.

## Family tree

Spouses are paired into a single family unit, generations are visually connected, and the print preview preserves these pairs. Register and memorial print styles remain available.

## Safe migration

The schema update only appends columns and creates new sheets/folders. It does not rename or delete existing dashboard records. Older photos continue to work through the legacy fallback while new photos use original + display + thumbnail storage.
