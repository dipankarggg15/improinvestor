export function sectorSlug(name: string) {
  const base = legacySectorSlug(name) || "sector";
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${base}-${(hash >>> 0).toString(36)}`;
}

export function legacySectorSlug(name: string) {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
