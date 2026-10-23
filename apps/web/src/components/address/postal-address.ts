export interface PostalAddress {
  line1: string;
  line2: string;
  landmark: string;
  state: string;
  country: string;
  city: string;
  postalCode: string;
}

export const ADDRESS_COUNTRIES = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'IN', label: 'India' },
] as const;

export function emptyPostalAddress(country = ''): PostalAddress {
  return { line1: '', line2: '', landmark: '', state: '', country, city: '', postalCode: '' };
}

export function countryLabel(code: string): string {
  return ADDRESS_COUNTRIES.find((country) => country.value === code)?.label ?? code;
}

export function postalAddressLines(address: PostalAddress): string[] {
  const locality = [address.city.trim(), [address.state.trim(), address.postalCode.trim()].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [address.line1, address.line2, address.landmark, locality].map((line) => line.trim()).filter(Boolean);
}

export function placeFromAddress(address: PostalAddress): string {
  const place = [address.city.trim(), address.state.trim()].filter(Boolean).join(', ');
  const value = place.length >= 2 ? place : address.line1.trim();
  return (value.length >= 2 ? value : 'Primary location').slice(0, 160);
}

const STORED_ADDRESS_PREFIX = 'abapro-address:v1\n';

export function storedPostalAddress(address: PostalAddress): string {
  const parts = [address.line1, address.line2, address.landmark, address.city, address.state, address.postalCode, address.country].map((part) =>
    part.trim().replace(/\s*\n+\s*/g, ' '),
  );
  if (parts.every((part) => part.length === 0)) return '';
  return STORED_ADDRESS_PREFIX + parts.join('\n');
}

export function postalAddressFromStored(stored: string | null | undefined, country = ''): PostalAddress {
  const address = emptyPostalAddress(country);
  const text = stored?.trim() ?? '';
  if (!text) return address;
  if (text.startsWith(STORED_ADDRESS_PREFIX)) {
    const [line1 = '', line2 = '', landmark = '', city = '', state = '', postalCode = '', storedCountry = ''] = text
      .slice(STORED_ADDRESS_PREFIX.length)
      .split('\n');
    return {
      line1,
      line2,
      landmark,
      city,
      state,
      postalCode,
      country: storedCountry || country,
    };
  }
  const label = country ? countryLabel(country) : '';
  const suffix = label ? `, ${label}` : '';
  address.line1 = suffix && text.endsWith(suffix) ? text.slice(0, -suffix.length) : text;
  return address;
}

export function displayStoredAddress(stored: string | null | undefined, country = ''): string {
  const text = stored?.trim() ?? '';
  if (!text.startsWith(STORED_ADDRESS_PREFIX)) return text;
  return formatPostalAddress(postalAddressFromStored(text, country));
}

export function samePostalAddress(left: PostalAddress, right: PostalAddress): boolean {
  return (Object.keys(left) as Array<keyof PostalAddress>).every((key) => left[key].trim() === right[key].trim());
}

export function formatPostalAddress(address: PostalAddress): string {
  const lines = postalAddressLines(address);
  if (lines.length === 0) return '';
  if (address.country.trim()) lines.push(countryLabel(address.country));
  return lines.join(', ');
}
