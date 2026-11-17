/**
 * Themes read from a startup's own description by keyword. An estimate, not a classification:
 * it only sees startups that describe themselves, and only the words they chose.
 */
export const THEMES: { id: string; label: string; re: RegExp; query: string }[] = [
  { id: 'ai', label: 'AI and machine learning', re: /\b(ai|artificial intelligence|machine learning|deep learning|intelligence artificielle|computer vision|nlp|llm|generative)\b/i, query: 'artificial intelligence' },
  { id: 'marketplace', label: 'Marketplace', re: /\bmarket ?places?\b/i, query: 'marketplace' },
  { id: 'data', label: 'Data and analytics', re: /\b(big data|data|analytics)\b/i, query: 'data' },
  { id: 'mobile', label: 'Mobile app', re: /\bmobile (app|application)s?\b/i, query: 'mobile' },
  { id: 'saas', label: 'SaaS', re: /\bsaas\b/i, query: 'saas' },
  { id: 'iot', label: 'IoT', re: /\b(iot|internet of things|connected objects?)\b/i, query: 'iot' },
  { id: 'payments', label: 'Payments', re: /\b(payments?|paiements?|e-?wallets?)\b/i, query: 'payment' },
  { id: 'xr', label: 'AR and VR', re: /\b(augmented reality|virtual reality|mixed reality|metaverse|r[ée]alit[ée] (augment|virtuel)\w*)\b/i, query: 'reality' },
  { id: 'energy', label: 'Energy', re: /\b(energy|solar|photovoltaic|[ée]nergie)\b/i, query: 'energy' },
  { id: 'robotics', label: 'Drones and robotics', re: /\b(drones?|robots?|robotics)\b/i, query: 'robot' },
  { id: 'recycling', label: 'Recycling and waste', re: /\b(recycl\w*|waste|d[ée]chets?)\b/i, query: 'recycling' },
  { id: 'water', label: 'Water and irrigation', re: /\b(water|irrigation)\b/i, query: 'water' },
  { id: 'blockchain', label: 'Blockchain', re: /\b(blockchain|crypto\w*|web3)\b/i, query: 'blockchain' },
  { id: 'africa', label: 'Africa and export', re: /\b(africa\w*|afrique|export\w*)\b/i, query: 'africa' },
]

export const themesOf = (description: string | null) => (description ? THEMES.filter((t) => t.re.test(description)).map((t) => t.id) : [])
