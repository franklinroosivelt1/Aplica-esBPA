/**
 * gmsParser.ts
 *
 * Robust parser for Brazilian SICAR / Military coordinates:
 * - GMS with symbols: 08°36'25.88"S 69°47'17.47"W
 * - GMS with commas and spaces: 8°36'25.88" S, 69°47'17.47" W
 * - GMS spaced with slash: 08 36 25.88 S / 69 47 17.47 W
 * - Decimal: -8.607189, -69.788186
 */

export interface ParsedCoordinate {
  lat: number;
  lng: number;
  latFormatted: string; // e.g. -8.607189
  lngFormatted: string; // e.g. -69.788186
  latGms: string;       // e.g. 08°36'25.88" S
  lngGms: string;       // e.g. 69°47'17.47" W
  fullGms: string;
}

// Convert decimal to formatted GMS
export function decimalToGms(val: number, isLat: boolean): string {
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFrac = (abs - deg) * 60;
  const min = Math.floor(minFrac);
  const sec = (minFrac - min) * 60;

  const degStr = String(deg).padStart(2, '0');
  const minStr = String(min).padStart(2, '0');
  const secStr = sec.toFixed(2).padStart(5, '0');

  let hemisphere = '';
  if (isLat) {
    hemisphere = val >= 0 ? 'N' : 'S';
  } else {
    hemisphere = val >= 0 ? 'E' : 'W';
  }

  return `${degStr}°${minStr}'${secStr}" ${hemisphere}`;
}

// Helper to parse a single GMS token like `08°36'25.88"S` or `08 36 25.88 S` or `-8.607189`
export function parseGmsPart(raw: string): { value: number; isLat?: boolean } | null {
  if (!raw) return null;
  const str = raw.trim();

  // Check if it's already decimal e.g. -8.607189 or -69.788186
  const pureDecimalMatch = str.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (pureDecimalMatch) {
    return { value: parseFloat(pureDecimalMatch[1]) };
  }

  // Regex for standard degrees, minutes, seconds with hemisphere (N/S/E/W or O)
  // Supports: 08°36'25.88"S, 8° 36' 25.88" S, 08 36 25.88 S, 08d 36m 25.88s S
  const gmsRegex = /(\d+)\s*(?:°|deg|d|\s)\s*(\d+)\s*(?:'|min|m|\s)\s*(\d+(?:[.,]\d+)?)\s*(?:"|sec|s|\s)?\s*([NSEWO])/i;
  const match = str.match(gmsRegex);

  if (match) {
    const deg = parseFloat(match[1]);
    const min = parseFloat(match[2]);
    const sec = parseFloat(match[3].replace(',', '.'));
    const hemi = match[4].toUpperCase();

    let decimal = deg + min / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W' || hemi === 'O') {
      decimal = -decimal;
    }

    const isLat = hemi === 'N' || hemi === 'S';
    return { value: decimal, isLat };
  }

  // Also support spaced format: 08 36 25.88 S
  const spacedRegex = /(\d+)\s+(\d+)\s+(\d+(?:[.,]\d+)?)\s*([NSEWO])/i;
  const spacedMatch = str.match(spacedRegex);
  if (spacedMatch) {
    const deg = parseFloat(spacedMatch[1]);
    const min = parseFloat(spacedMatch[2]);
    const sec = parseFloat(spacedMatch[3].replace(',', '.'));
    const hemi = spacedMatch[4].toUpperCase();

    let decimal = deg + min / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W' || hemi === 'O') {
      decimal = -decimal;
    }

    const isLat = hemi === 'N' || hemi === 'S';
    return { value: decimal, isLat };
  }

  return null;
}

// Full parser for single combined string
export function parseCoordinates(input: string): ParsedCoordinate | null {
  if (!input || !input.trim()) return null;
  const cleaned = input.trim();

  // Pattern 1: Look for explicit Latitude and Longitude with hemisphere tags (N/S and W/O/E)
  // Example: 08°36'25.88"S 69°47'17.47"W or 8°36'25.88" S, 69°47'17.47" W
  const partsWithHemi = cleaned.match(/(\d+[\d°'\".,\s]+[NSns])[\s,\/]+(\d+[\d°'\".,\s]+[WEOWEOweoweo])/i) ||
                        cleaned.match(/(\d+[\d°'\".,\s]+[WEOWEOweoweo])[\s,\/]+(\d+[\d°'\".,\s]+[NSns])/i);

  if (partsWithHemi) {
    const part1 = parseGmsPart(partsWithHemi[1]);
    const part2 = parseGmsPart(partsWithHemi[2]);

    if (part1 && part2) {
      let lat = part1.isLat ? part1.value : part2.value;
      let lng = part1.isLat ? part2.value : part1.value;

      return createParsedCoordinate(lat, lng);
    }
  }

  // Pattern 2: Separated by slash, comma, or semicolon
  // e.g. "08 36 25.88 S / 69 47 17.47 W" or "8°36'25.88" S, 69°47'17.47" W"
  const splitDelims = cleaned.split(/[\/,;]|\s+e\s+/i);
  if (splitDelims.length === 2) {
    const p1 = parseGmsPart(splitDelims[0]);
    const p2 = parseGmsPart(splitDelims[1]);
    if (p1 && p2) {
      let lat = p1.isLat !== undefined ? (p1.isLat ? p1.value : p2.value) : p1.value;
      let lng = p2.isLat !== undefined ? (!p2.isLat ? p2.value : p1.value) : p2.value;
      
      // If latitude is between -90 and 90 and longitude between -180 and 180
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return createParsedCoordinate(lat, lng);
      }
    }
  }

  // Pattern 3: Two decimal numbers e.g. "-8.607189 -69.788186" or "-8.607189, -69.788186"
  const decimalMatches = cleaned.match(/([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)/);
  if (decimalMatches) {
    const lat = parseFloat(decimalMatches[1]);
    const lng = parseFloat(decimalMatches[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return createParsedCoordinate(lat, lng);
    }
  }

  return null;
}

function createParsedCoordinate(lat: number, lng: number): ParsedCoordinate {
  const latFormatted = lat.toFixed(6);
  const lngFormatted = lng.toFixed(6);
  const latGms = decimalToGms(lat, true);
  const lngGms = decimalToGms(lng, false);

  return {
    lat,
    lng,
    latFormatted,
    lngFormatted,
    latGms,
    lngGms,
    fullGms: `${latGms}  ${lngGms}`
  };
}
