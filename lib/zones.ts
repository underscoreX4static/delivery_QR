// Brisbane CBD inner ring only — max ~15-20 min drive from CBD.
// Validate SERVER-SIDE only, on every checkout/order-creation route. Never trust
// client-supplied postcode validation.

export const BRISBANE_POSTCODES = new Set<string>([
  '4000', // Brisbane CBD
  '4001', // Brisbane City (GPO)
  '4005', // New Farm, Teneriffe
  '4006', // Fortitude Valley, Bowen Hills, Newstead
  '4007', // Hamilton, Albion
  '4010', // Herston, Spring Hill
  '4051', // Gordon Park, Grange, Alderley, Wilston
  '4059', // Kelvin Grove, Red Hill
  '4060', // Paddington, Given Terrace
  '4064', // Milton, Petrie Terrace, Rosalie
  '4065', // Toowong, Taringa
  '4066', // Auchenflower
  '4101', // West End, South Brisbane, Highgate Hill
  '4102', // Woolloongabba, Dutton Park
  '4103', // Annerley, Fairfield
  '4169', // East Brisbane, Kangaroo Point
  '4170', // Norman Park, Coorparoo
])

export interface BrisbaneSuburb {
  suburb: string
  postcode: string
}

export const BRISBANE_SUBURBS: BrisbaneSuburb[] = [
  { suburb: 'Brisbane City', postcode: '4000' },
  { suburb: 'Spring Hill', postcode: '4000' },
  { suburb: 'Brisbane CBD', postcode: '4001' },
  { suburb: 'New Farm', postcode: '4005' },
  { suburb: 'Teneriffe', postcode: '4005' },
  { suburb: 'Fortitude Valley', postcode: '4006' },
  { suburb: 'Bowen Hills', postcode: '4006' },
  { suburb: 'Newstead', postcode: '4006' },
  { suburb: 'Hamilton', postcode: '4007' },
  { suburb: 'Albion', postcode: '4007' },
  { suburb: 'Herston', postcode: '4010' },
  { suburb: 'Gordon Park', postcode: '4051' },
  { suburb: 'Grange', postcode: '4051' },
  { suburb: 'Alderley', postcode: '4051' },
  { suburb: 'Wilston', postcode: '4051' },
  { suburb: 'Kelvin Grove', postcode: '4059' },
  { suburb: 'Red Hill', postcode: '4059' },
  { suburb: 'Paddington', postcode: '4060' },
  { suburb: 'Given Terrace', postcode: '4060' },
  { suburb: 'Milton', postcode: '4064' },
  { suburb: 'Petrie Terrace', postcode: '4064' },
  { suburb: 'Rosalie', postcode: '4064' },
  { suburb: 'Toowong', postcode: '4065' },
  { suburb: 'Taringa', postcode: '4065' },
  { suburb: 'Auchenflower', postcode: '4066' },
  { suburb: 'West End', postcode: '4101' },
  { suburb: 'South Brisbane', postcode: '4101' },
  { suburb: 'Highgate Hill', postcode: '4101' },
  { suburb: 'Woolloongabba', postcode: '4102' },
  { suburb: 'Dutton Park', postcode: '4102' },
  { suburb: 'Annerley', postcode: '4103' },
  { suburb: 'Fairfield', postcode: '4103' },
  { suburb: 'East Brisbane', postcode: '4169' },
  { suburb: 'Kangaroo Point', postcode: '4169' },
  { suburb: 'Norman Park', postcode: '4170' },
  { suburb: 'Coorparoo', postcode: '4170' },
]

export function isBrisbanePostcode(postcode: string): boolean {
  return BRISBANE_POSTCODES.has(postcode.trim())
}

/**
 * Extracts a 4-digit Australian postcode from a free-text delivery address and
 * validates it against the Brisbane whitelist. Returns false if no postcode is
 * found or it falls outside the zone.
 */
export function isAddressInDeliveryZone(address: string): boolean {
  const match = address.match(/\b(4\d{3})\b/)
  if (!match) return false
  return isBrisbanePostcode(match[1])
}
