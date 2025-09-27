import {
  normalizeDomain,
  isValidDomain,
  extractDomainFromHost,
  isSubdomain,
  getRootDomain,
  getSubdomainSuggestions,
} from '../shared/utils/domainUtils';

describe('Domain Utils', () => {
  describe('normalizeDomain', () => {
    it('should remove protocol from domain', () => {
      expect(normalizeDomain('https://example.com')).toBe('example.com');
      expect(normalizeDomain('http://example.com')).toBe('example.com');
    });

    it('should remove trailing slash', () => {
      expect(normalizeDomain('example.com/')).toBe('example.com');
    });

    it('should convert to lowercase', () => {
      expect(normalizeDomain('EXAMPLE.COM')).toBe('example.com');
    });

    it('should trim whitespace', () => {
      expect(normalizeDomain('  example.com  ')).toBe('example.com');
    });
  });

  describe('isValidDomain', () => {
    it('should validate correct domains', () => {
      expect(isValidDomain('example.com')).toBe(true);
      expect(isValidDomain('sub.example.com')).toBe(true);
      expect(isValidDomain('api.example.com')).toBe(true);
      expect(isValidDomain('test-domain.com')).toBe(true);
    });

    it('should reject invalid domains', () => {
      expect(isValidDomain('')).toBe(false);
      expect(isValidDomain('example')).toBe(false);
      expect(isValidDomain('.com')).toBe(false);
      expect(isValidDomain('example.')).toBe(false);
      expect(isValidDomain('example..com')).toBe(false);
    });
  });

  describe('extractDomainFromHost', () => {
    it('should extract domain from host header', () => {
      expect(extractDomainFromHost('example.com')).toBe('example.com');
      expect(extractDomainFromHost('example.com:3000')).toBe('example.com');
      expect(extractDomainFromHost('api.example.com:8080')).toBe('api.example.com');
    });

    it('should convert to lowercase', () => {
      expect(extractDomainFromHost('EXAMPLE.COM')).toBe('example.com');
    });
  });

  describe('isSubdomain', () => {
    it('should identify subdomains', () => {
      expect(isSubdomain('api.example.com')).toBe(true);
      expect(isSubdomain('sub.example.com')).toBe(true);
      expect(isSubdomain('app.staging.example.com')).toBe(true);
    });

    it('should identify root domains', () => {
      expect(isSubdomain('example.com')).toBe(false);
      expect(isSubdomain('localhost')).toBe(false);
    });
  });

  describe('getRootDomain', () => {
    it('should return root domain from subdomain', () => {
      expect(getRootDomain('api.example.com')).toBe('example.com');
      expect(getRootDomain('app.staging.example.com')).toBe('example.com');
    });

    it('should return same domain for root domains', () => {
      expect(getRootDomain('example.com')).toBe('example.com');
      expect(getRootDomain('localhost')).toBe('localhost');
    });
  });

  describe('getSubdomainSuggestions', () => {
    it('should generate common subdomain suggestions', () => {
      const suggestions = getSubdomainSuggestions('example.com');
      
      expect(suggestions).toContain('api.example.com');
      expect(suggestions).toContain('app.example.com');
      expect(suggestions).toContain('admin.example.com');
      expect(suggestions).toContain('dashboard.example.com');
      expect(suggestions).toContain('portal.example.com');
    });

    it('should include all common subdomains', () => {
      const suggestions = getSubdomainSuggestions('example.com');
      
      expect(suggestions).toHaveLength(9);
      expect(suggestions).toEqual([
        'api.example.com',
        'app.example.com',
        'admin.example.com',
        'dashboard.example.com',
        'portal.example.com',
        'www.example.com',
        'staging.example.com',
        'dev.example.com',
        'test.example.com'
      ]);
    });
  });
});
