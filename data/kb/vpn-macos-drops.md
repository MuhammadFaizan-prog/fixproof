---
id: vpn-macos-drops
title: VPN drops every few minutes on macOS
category: network
os: [macos]
region: [any]
updated: 2026-10-02
has_script: true
script_lang: zsh
synthetic: true
---
# VPN drops every few minutes on macOS

## Symptoms
The Northwind VPN connects, then disconnects every few minutes. macOS may show error 809 or "The VPN server did not respond". It often starts after a macOS or VPN client update, because the update leaves a stale VPN profile behind.

## Fix: reset the VPN profile
1. Click the Northwind VPN icon in the menu bar and choose **Disconnect**.
2. Choose **Settings > Reset profile**. Your saved server list is rebuilt; you do not need to reinstall anything.
3. Reconnect and sign in with your work account and MFA.
Most people are stable again within a minute. The reset does not need admin rights.

## Script: restart the VPN agent
If the menu bar icon does not respond, the help desk can run this approved script on your Mac. It only restarts the Northwind VPN agent for your user and lists the VPN profile.

```zsh
#!/bin/zsh
# Northwind VPN agent restart (macOS). Scope: this Mac, current user only.
launchctl kickstart -k gui/$(id -u)/com.northwind.vpnagent
scutil --nc list | grep "Northwind"
```

## If it still drops
If the VPN still drops after the reset, the problem is usually the network you are on. Try a phone hotspot for five minutes. If the hotspot is stable, the issue is your local Wi-Fi; if not, raise a ticket so Network Operations can check your account.
