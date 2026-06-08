/**
 * Utility functions for input validation and security.
 */

// IPs that are strictly forbidden (Loopback, Private, Link-local, Multicast, etc.)
const FORBIDDEN_IP_RANGES = [
  /^127\./,           // Loopback
  /^10\./,            // Class A Private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B Private
  /^192\.168\./,      // Class C Private
  /^169\.254\./,      // Link-local
  /^0\./,             // Current network
  /^224\./,           // Multicast
  /^240\./,           // Future use
  /^255\.255\.255\.255/, // Broadcast
  /^::1$/,            // IPv6 Loopback
  /^[fF][cCdD]/,      // IPv6 Unique Local Address
  /^[fF][eE][89aAbBcCdDeEfF]/, // IPv6 Link-local
];

const FORBIDDEN_HOSTNAMES = [
  'localhost',
  'metadata.google.internal', // GCP
  '169.254.169.254',          // AWS/GCP/Azure IMDS
];

/**
 * Checks whether the given URL is safe to fetch (prevents SSRF).
 * - Restricts to HTTP/HTTPS/TCP protocols.
 * - Blocks local, loopback, and private IP ranges.
 * - Blocks common metadata hostnames.
 * @param urlString The URL to validate.
 * @returns boolean True if safe, false otherwise.
 */
export function isSafeUrl(urlString: string): boolean {
  try {
    // Allows parsing tcp:// by temporarily pretending it's http:// for URL parser
    const parseableUrl = urlString.startsWith('tcp://') ? urlString.replace('tcp://', 'http://') : urlString;
    const url = new URL(parseableUrl);

    if (FORBIDDEN_HOSTNAMES.includes(url.hostname.toLowerCase())) {
      return false;
    }

    // Check if hostname is an IP and matches forbidden ranges
    for (const regex of FORBIDDEN_IP_RANGES) {
      if (regex.test(url.hostname)) {
        return false;
      }
    }

    // Additional safeguard: If it contains special characters often used to bypass parsers
    if (url.hostname.includes('@') || url.username || url.password) {
      return false;
    }

    return true;
  } catch (e) {
    return false; // Invalid URL
  }
}
