export interface DestinationItem {
  dest_geoip: string;
  count: number;
}

export interface HoveredCountry {
  name: string;
  code: string;
  count: number;
  flag: string;
  x: number;
  y: number;
}
