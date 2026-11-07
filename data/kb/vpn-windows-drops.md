---
id: vpn-windows-drops
title: VPN drops every few minutes on Windows
category: network
os: [windows]
region: [any]
updated: 2026-10-02
has_script: true
script_lang: powershell
synthetic: true
---
# VPN drops every few minutes on Windows

## Symptoms
The Northwind VPN disconnects every few minutes on a Windows 11 laptop, sometimes with error 809. It usually follows a Windows update that changed the network adapter driver.

## Fix: reset the VPN profile
1. Right-click the Northwind VPN icon in the system tray and choose **Disconnect**.
2. Open **Settings > Reset profile** in the VPN client.
3. Reconnect and approve the MFA prompt.

## Script: restart the VPN service
The help desk may run this approved script on a managed Windows laptop. It restarts the Northwind VPN service only.

```powershell
# Northwind VPN service restart (Windows). Scope: this workstation only.
Restart-Service -Name NorthwindVpnAgent
Get-Service -Name NorthwindVpnAgent | Select-Object Status
```
