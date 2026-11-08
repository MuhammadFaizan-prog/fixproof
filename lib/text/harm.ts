/** What an Inspect category means for the employee, in a few words. */
export function scriptHarm(category: string | null | undefined): string {
  const c = (category ?? "").toLowerCase();
  if (/edr|security blinding|antivirus|defender/.test(c)) return "it turns off antivirus";
  if (/credential|memory dump/.test(c)) return "it tries to collect passwords";
  if (/persistence|access expansion/.test(c)) return "it widens access to the machine";
  if (/destruction|ransom|forensic/.test(c)) return "it deletes or hides data";
  if (/download|payload|obfuscat/.test(c)) return "it downloads or hides code";
  return c ? `it looks like ${c}` : "Inspect did not clear it";
}

