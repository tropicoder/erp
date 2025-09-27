/**
 * Domain utility functions for project domain management
 */

/**
 * Normalize domain name by removing protocol and trailing slashes
 * @param domain - The domain to normalize
 * @returns Normalized domain
 */
export function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, '') // Remove protocol
    .replace(/\/$/, '') // Remove trailing slash
    .trim();
}

/**
 * Validate domain format
 * @param domain - The domain to validate
 * @returns True if domain is valid
 */
export function isValidDomain(domain: string): boolean {
  const normalizedDomain = normalizeDomain(domain);
  
  // Basic domain validation regex
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.?[a-zA-Z]{2,}$/;
  
  return domainRegex.test(normalizedDomain);
}

/**
 * Extract domain from host header
 * @param host - The host header value
 * @returns Domain without port
 */
export function extractDomainFromHost(host: string): string {
  return host.split(':')[0].toLowerCase();
}

/**
 * Check if domain is a subdomain
 * @param domain - The domain to check
 * @returns True if domain is a subdomain
 */
export function isSubdomain(domain: string): boolean {
  const normalizedDomain = normalizeDomain(domain);
  const parts = normalizedDomain.split('.');
  return parts.length > 2;
}

/**
 * Get root domain from subdomain
 * @param domain - The domain (could be subdomain)
 * @returns Root domain
 */
export function getRootDomain(domain: string): string {
  const normalizedDomain = normalizeDomain(domain);
  const parts = normalizedDomain.split('.');
  
  if (parts.length <= 2) {
    return normalizedDomain;
  }
  
  // Return the last two parts (e.g., example.com from api.example.com)
  return parts.slice(-2).join('.');
}

/**
 * Generate subdomain suggestions for a domain
 * @param rootDomain - The root domain
 * @returns Array of common subdomain suggestions
 */
export function getSubdomainSuggestions(rootDomain: string): string[] {
  const commonSubdomains = [
    'api',
    'app',
    'admin',
    'dashboard',
    'portal',
    'www',
    'staging',
    'dev',
    'test'
  ];
  
  return commonSubdomains.map(subdomain => `${subdomain}.${rootDomain}`);
}
