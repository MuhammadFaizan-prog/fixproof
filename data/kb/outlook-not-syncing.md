---
id: outlook-not-syncing
title: Outlook not syncing on Windows
category: software
os: [windows]
region: [any]
updated: 2026-09-09
has_script: false
synthetic: true
---
# Outlook not syncing on Windows

## Symptoms
New mail stops arriving, the status bar says "Disconnected" or "Trying to connect", and Outlook on the web shows mail that the desktop app does not.

## Fix
1. Check **File > Office Account** shows your Northwind account. Sign out and back in if it shows an error.
2. Turn off **Work Offline** on the Send/Receive tab.
3. Close Outlook, then open it while holding **Ctrl** and choose **Yes** to start in safe mode. If it syncs in safe mode, disable add-ins one at a time.
4. If nothing helps, use **Account settings > Repair**.
