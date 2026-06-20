export function formatCountryName(countryCode: string, locale: string = "en"): string {
  if (!countryCode) return "";
  try {
    const regionNames = new Intl.DisplayNames([locale], { type: "region" });
    return regionNames.of(countryCode.toUpperCase()) || countryCode;
  } catch (e) {
    return countryCode;
  }
}
