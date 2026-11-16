// Sample: reads a sentence into search filters with word lists. Prepare's AI replaces this;
// until then the UI labels the reading as a sample and shows exactly how it read the sentence.

const SECTOR_WORDS: [RegExp, string][] = [
  [/\b(fintech|payment|payments|bank|banking|lending|wallet|finance|paiement|مالية)\b/i, 'Fintech'],
  [/\b(health|healthtech|medical|doctor|doctors|clinic|santé|sante|médical|صحة)\b/i, 'HealthTech'],
  [/\b(agri|agritech|farm|farmers|farming|agriculture|agricole|فلاحة)\b/i, 'Agritech'],
  [/\b(edtech|education|school|students|learning|éducation|تعليم)\b/i, 'EdTech'],
  [/\b(mobility|transport|delivery|logistics|livraison|نقل)\b/i, 'Mobility'],
  [/\b(travel|tourism|tourisme|hotel|سياحة)\b/i, 'TravelTech'],
  [/\b(food|foodtech|restaurant|restaurants|alimentation)\b/i, 'FoodTech & New Food'],
  [/\b(environment|green|recycling|waste|energy|solar|environnement|بيئة)\b/i, 'Environment'],
  [/\b(shop|shopping|ecommerce|e-commerce|marketplace|commerce)\b/i, 'Commerce and shopping'],
  [/\b(security|cybersecurity|sécurité)\b/i, 'Security'],
  [/\b(real estate|property|immobilier)\b/i, 'Real Estate Tech'],
  [/\b(robot|robotics|manufacturing|industrial|industrie)\b/i, 'Advanced Manufacturing & Robotics'],
]

const FILLER = new Set(
  'a an the and or of in on for with to by from that who which startups startup companies company show me find any all labelled labeled founded tunisian tunisia les des une un et de du dans pour avec qui sans after since before until between without website websites no description descriptions'.split(
    ' ',
  ),
)

export type AskReading = {
  filters: { q?: string; sector?: string; from?: number; to?: number; website?: 'yes' | 'no'; described?: 'yes' | 'no' }
  read: string[]
}

export function readAsk(sentence: string, known: string[]): AskReading {
  let rest = ` ${sentence} `
  const filters: AskReading['filters'] = {}
  const read: string[] = []

  for (const [re, sector] of SECTOR_WORDS) {
    if (known.includes(sector) && re.test(rest)) {
      filters.sector = sector
      read.push(`sector: ${sector}`)
      rest = rest.replace(re, ' ')
      break
    }
  }

  const after = rest.match(/\b(?:after|since|depuis|après|apres|بعد)\s+(20\d\d)\b/i)
  const before = rest.match(/\b(?:before|until|avant|قبل)\s+(20\d\d)\b/i)
  const inYear = rest.match(/\b(?:in|en)\s+(20\d\d)\b/i)
  if (after) ((filters.from = Number(after[1]) + (/(after|après|apres|بعد)/i.test(after[0]) ? 1 : 0)), read.push(`labelled from ${filters.from}`))
  if (before) ((filters.to = Number(before[1]) - (/(before|avant|قبل)/i.test(before[0]) ? 1 : 0)), read.push(`labelled until ${filters.to}`))
  if (inYear && !after && !before) ((filters.from = filters.to = Number(inYear[1])), read.push(`labelled in ${inYear[1]}`))
  rest = rest.replace(/\b20\d\d\b/g, ' ')

  if (/\b(no|without|sans)\s+(a\s+)?description/i.test(rest)) ((filters.described = 'no'), read.push('no description'))
  else if (/\b(no|without|sans)\s+(a\s+)?(web)?site/i.test(rest)) ((filters.website = 'no'), read.push('no website'))

  const words = rest
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !FILLER.has(w))
  if (words.length) ((filters.q = words.join(' ')), read.push(`words: ${words.join(', ')}`))
  return { filters, read }
}
