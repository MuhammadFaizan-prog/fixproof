---
id: vpn-linux-drops
title: VPN drops on Linux workstations
category: network
os: [linux]
region: [any]
updated: 2026-09-18
has_script: true
script_lang: bash
synthetic: true
---
# VPN drops on Linux workstations

## Symptoms
On Ubuntu 24.04 engineering workstations, the Northwind VPN (WireGuard profile) drops after the laptop sleeps or after a kernel update.

## Fix
1. Run `nmcli connection down northwind-vpn` and then `nmcli connection up northwind-vpn`.
2. If the profile is missing, re-import it from the self-service portal under **Downloads > Linux VPN profile**.

## Script
```bash
#!/bin/bash
# Northwind VPN reconnect (Linux). Scope: this workstation, NetworkManager profile only.
nmcli connection down northwind-vpn || true
nmcli connection up northwind-vpn
nmcli -t -f NAME,STATE connection show --active | grep northwind
```
