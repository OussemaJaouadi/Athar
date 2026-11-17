/** "Advanced Manufacturing & Robotics" in the registry, "advanced-manufacturing-robotics" in an address. */
export const sectorSlug = (sector: string) =>
  sector
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
