// What registered startups do, as plain areas. Pure data, safe in the browser and on the server.

export type AreaDef = { id: string; name: string; blurb: string; words: string[]; open?: boolean }

export const AREAS: AreaDef[] = [
  { id: 'farm-to-market', name: 'Farm to market', blurb: 'Selling farm produce to shops, restaurants and export', words: ['agri', 'farm', 'olive', 'crop', 'irrigation', 'livestock'] },
  { id: 'care-at-distance', name: 'Care at a distance', blurb: 'Telemedicine, clinic software and patient follow-up', words: ['telemedicine', 'patient', 'medical', 'doctor', 'clinic', 'hospital'] },
  { id: 'learning-online', name: 'Learning online', blurb: 'Courses, tutoring and school tools on the web', words: ['learning', 'student', 'courses', 'education', 'tutor', 'school'] },
  { id: 'paying-lending', name: 'Paying and lending', blurb: 'Payments, wallets, credit and insurance', words: ['payment', 'wallet', 'lending', 'banking', 'insurance', 'credit'] },
  { id: 'last-mile', name: 'Last-mile delivery', blurb: 'Couriers, fleets and getting parcels to the door', words: ['delivery', 'logistics', 'fleet', 'shipping', 'courier'] },
  { id: 'selling-online', name: 'Selling online', blurb: 'Marketplaces and online shops', words: ['marketplace', 'ecommerce', 'e-commerce', 'online store', 'retail'] },
  { id: 'smart-industry', name: 'Smart industry', blurb: 'Sensors, automation and robots for factories', words: ['iot', 'industrial', 'manufacturing', 'robot', 'sensor', 'automation'] },
  { id: 'energy-waste', name: 'Clean energy and waste', blurb: 'Solar, recycling and waste collection', words: ['solar', 'energy', 'recycling', 'waste', 'renewable'] },
  { id: 'travel-stays', name: 'Travel and stays', blurb: 'Booking trips, hotels and local experiences', words: ['tourism', 'travel', 'booking', 'hotel', 'trip'] },
  { id: 'work-hiring', name: 'Work and hiring', blurb: 'Recruiting, job boards and freelance work', words: ['recruitment', 'hiring', 'jobs', 'freelance', 'talent'] },
  { id: 'media-creators', name: 'Media and creators', blurb: 'Video, music, games and content', words: ['video', 'content', 'media', 'music', 'gaming', 'game'] },
  { id: 'software-smes', name: 'Software for small firms', blurb: 'ERP, CRM, invoicing and accounting', words: ['erp', 'saas', 'crm', 'invoicing', 'accounting'] },
  { id: 'elder-care', name: 'Elder care at home', blurb: 'Care and services for older people at home', words: ['elderly', 'seniors', 'retirement', 'nursing'], open: true },
  { id: 'water-reuse', name: 'Water reuse', blurb: 'Treating and reusing wastewater', words: ['desalination', 'wastewater', 'greywater'], open: true },
  { id: 'legal-help', name: 'Legal help', blurb: 'Lawyers, notaries and legal paperwork', words: ['legal', 'lawyer', 'notary'], open: true },
  { id: 'sea-fishing', name: 'Fishing and the sea', blurb: 'Fishing, fish farming and the maritime trade', words: ['fishing', 'fishermen', 'aquaculture', 'maritime'], open: true },
  { id: 'disability', name: 'Disability access', blurb: 'Tools and services for people with disabilities', words: ['disability', 'disabled', 'blind', 'deaf', 'accessibility'], open: true },
  { id: 'housing-rent', name: 'Housing and rent', blurb: 'Renting, tenants and landlords', words: ['tenant', 'rental', 'housing', 'landlord'], open: true },
]
