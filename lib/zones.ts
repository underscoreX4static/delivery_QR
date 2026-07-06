// Brisbane delivery zone — postcode whitelist.
// Validate SERVER-SIDE only, on every checkout/order-creation route. Never trust
// client-supplied postcode validation.

export const BRISBANE_POSTCODES = new Set<string>([
  // Inner city
  '4000', '4001', '4002', '4003', '4004', '4005', '4006', '4007', '4008', '4009',
  '4010', '4011', '4012', '4013', '4014',
  // Inner north
  '4030', '4031', '4032', '4034', '4035', '4036', '4037',
  // Inner south
  '4101', '4102', '4103', '4104', '4105', '4106', '4107', '4108', '4109', '4110',
  '4111', '4112', '4113', '4114', '4115',
  // Inner west
  '4059', '4060', '4061', '4064', '4065', '4066', '4067', '4068', '4069', '4070',
  // Inner east
  '4151', '4152', '4153', '4154', '4155', '4156', '4157', '4158',
  // Northside
  '4017', '4018', '4019', '4020', '4021', '4022', '4034', '4053', '4054', '4055',
  '4500', '4501', '4502', '4503', '4504', '4505', '4506', '4507', '4508', '4509',
  // Southside
  '4109', '4116', '4117', '4118', '4119', '4120', '4121', '4122', '4123', '4124',
  '4125', '4127', '4128', '4129', '4130', '4131', '4132', '4133',
  // Westside / Moggill corridor
  '4069', '4070', '4071', '4072', '4073', '4074', '4075', '4076', '4077', '4078',
  // Bayside
  '4017', '4018', '4019', '4020', '4021', '4022', '4034', '4157', '4158', '4159',
  '4160', '4161', '4163', '4164', '4165', '4173', '4174', '4177', '4178', '4179',
])

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
