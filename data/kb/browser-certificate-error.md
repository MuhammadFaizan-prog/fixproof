---
id: browser-certificate-error
title: Certificate error on internal sites
category: network
os: [any]
region: [any]
updated: 2026-09-25
has_script: false
synthetic: true
---
# Certificate error on internal sites

## Symptoms
The browser says "Your connection is not private" on an internal Northwind site.

## Fix
1. Check the laptop date and time are set automatically.
2. Connect to the VPN; internal sites only have trusted certificates on the corporate network.
3. Do not click through the warning on sites that ask for your password.
