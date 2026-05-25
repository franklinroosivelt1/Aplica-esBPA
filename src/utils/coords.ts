
import * as utm from 'utm';

export function decimalToDMS(decimal: number, type: 'lat' | 'lng'): string {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(2);

  let direction = '';
  if (type === 'lat') {
    direction = decimal >= 0 ? 'N' : 'S';
  } else {
    direction = decimal >= 0 ? 'E' : 'W';
  }

  return `${degrees}°${minutes}'${seconds}" ${direction}`;
}

export function decimalToUTM(lat: number, lng: number): string {
  try {
    const converted = utm.fromLatLon(lat, lng);
    return `${converted.zoneNum}${converted.zoneLetter} E: ${Math.round(converted.easting)} N: ${Math.round(converted.northing)}`;
  } catch (e) {
    return "UTM Indisponível";
  }
}
