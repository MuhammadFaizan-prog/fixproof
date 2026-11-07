---
id: vpn-policy-2026
title: VPN client troubleshooting policy (2026)
category: network
os: [any]
region: [any]
updated: 2026-09-01
supersedes: vpn-policy-2024
has_script: false
synthetic: true
---
# VPN client troubleshooting policy (2026)

## Policy
Never uninstall or reinstall the VPN client yourself. Since the September 2026 client, reinstalling removes the device certificate and locks the laptop out of the network until the help desk re-enrolls it. Use **Reset profile** in the VPN client, or reset your VPN profile from the self-service portal.

## Why this changed
The 2026 client stores the device certificate in the client's own keychain entry. This policy replaces the 2024 policy.
