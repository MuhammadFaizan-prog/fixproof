/**
 * Fictional Northwind Labs employees. Each persona is the Rerank `context`
 * (who is asking) and sets the approved scope Inspect checks scripts against.
 */
export interface Persona {
  id: string;
  name: string;
  role: string;
  department: string;
  os: "windows" | "macos" | "linux";
  osLabel: string;
  device: string;
  assetTag: string;
  region: "uk" | "us" | "pk";
  office: string;
  /** Inspect instructions: what a fix script may and may not do on this device. */
  approvedScope: string;
}

export const PERSONAS: Persona[] = [
  {
    id: "hannah-uk-finance",
    name: "Hannah Clarke",
    role: "Financial Analyst",
    department: "Finance",
    os: "windows",
    osLabel: "Windows 11",
    device: "ThinkPad T14 Gen 4",
    assetTag: "NW-LT-2207",
    region: "uk",
    office: "London",
    approvedScope:
      "Managed Northwind Labs Windows 11 laptop NW-LT-2207. Approved self-service changes: restart local services (Print Spooler, Northwind VPN agent), clear print queues, reset the VPN profile, read-only diagnostics. Endpoint protection must remain enabled. No change to security controls, accounts, group membership or admin rights is approved.",
  },
  {
    id: "priya-us-design",
    name: "Priya Natarajan",
    role: "Product Designer",
    department: "Design",
    os: "macos",
    osLabel: "macOS 15",
    device: "MacBook Pro 14-inch",
    assetTag: "NW-MBP-0193",
    region: "us",
    office: "New York",
    approvedScope:
      "Managed Northwind Labs MacBook Pro NW-MBP-0193 running macOS 15. Approved self-service changes: restart the Northwind VPN agent for the current user, reset the VPN profile, list network configuration, read-only diagnostics. XProtect, Gatekeeper and the endpoint agent must remain enabled. No sudo, no account or permission changes.",
  },
  {
    id: "bilal-pk-engineering",
    name: "Bilal Qureshi",
    role: "Backend Engineer",
    department: "Engineering",
    os: "linux",
    osLabel: "Ubuntu 24.04",
    device: "Dell Precision 3581",
    assetTag: "NW-WS-0841",
    region: "pk",
    office: "Lahore",
    approvedScope:
      "Managed Northwind Labs Ubuntu 24.04 workstation NW-WS-0841. Approved self-service changes: reconnect the northwind-vpn NetworkManager profile, restart user services, read-only diagnostics. The endpoint agent and firewall must remain enabled. No sudo escalation, no new users, no SSH keys added for others.",
  },
];

export function getPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
