# Domain-Based Access Feature

## Overview

The Nexus ERP system now supports custom domain access for each tenant, allowing users to access their SaaS through their own domain names. This feature provides a more professional and branded experience for multi-tenant applications.

## What Was Added

### 1. Database Schema Changes

**File: `prisma/schema.prisma`**
- Added `domain` field to the `Project` model
- Made it optional and unique
- Added database migration file

```prisma
model Project {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  domain    String?  @unique // Custom domain for SaaS access
  // ... other fields
}
```

### 2. Domain Utilities

**File: `src/shared/utils/domainUtils.ts`**
- `normalizeDomain()` - Normalizes domain names
- `isValidDomain()` - Validates domain format
- `extractDomainFromHost()` - Extracts domain from host header
- `isSubdomain()` - Checks if domain is a subdomain
- `getRootDomain()` - Gets root domain from subdomain
- `getSubdomainSuggestions()` - Generates common subdomain suggestions

### 3. Enhanced Tenant Middleware

**File: `src/middleware/tenantMiddleware.ts`**
- Added domain-based project identification
- Falls back to `X-Project-ID` header if no domain match
- Added `getProjectIdByDomain()` helper function
- Enhanced logging for domain-based access

### 4. Updated Tenant Routes

**File: `src/core/tenants/tenantRoutes.ts`**
- Added domain field to create/update project schemas
- Enhanced validation with domain utilities
- Added domain normalization
- Updated search functionality to include domain
- Enhanced error messages for domain conflicts

### 5. Comprehensive Documentation

**Files: `README.md`, `API.md`**
- Added domain-based access documentation
- Updated API examples with domain usage
- Added setup instructions for custom domains
- Enhanced authentication section

### 6. Test Coverage

**File: `src/__tests__/domainUtils.test.ts`**
- Comprehensive tests for all domain utility functions
- Edge case testing
- Validation testing

## How It Works

### 1. Domain Configuration

When creating a project, users can specify a custom domain:

```json
{
  "name": "My Company",
  "slug": "my-company",
  "domain": "mycompany.com",
  // ... other fields
}
```

### 2. Automatic Detection

The system automatically detects the project based on the request domain:

```bash
# Access via custom domain
curl -X GET https://mycompany.com/api/iam/users \
  -H "Authorization: Bearer <access_token>"

# Access via X-Project-ID header (fallback)
curl -X GET https://api.nexus.com/iam/users \
  -H "Authorization: Bearer <access_token>" \
  -H "X-Project-ID: project_123"
```

### 3. Middleware Flow

1. **Check X-Project-ID header** - If present, use it directly
2. **Extract domain from host** - Parse the request host header
3. **Normalize domain** - Clean and standardize the domain
4. **Lookup project** - Find project by domain in database
5. **Load tenant context** - Create tenant-specific clients
6. **Continue request** - Process with tenant context

## API Changes

### Create Project

**Before:**
```json
{
  "name": "My Company",
  "slug": "my-company"
}
```

**After:**
```json
{
  "name": "My Company",
  "slug": "my-company",
  "domain": "mycompany.com"
}
```

### Authentication

**Before:**
```
X-Project-ID: <project_id>
```

**After:**
```
# Option 1: Custom domain
Host: mycompany.com

# Option 2: X-Project-ID header (fallback)
X-Project-ID: <project_id>
```

## Benefits

### 1. Professional Branding
- Each tenant can use their own domain
- No need to expose internal project IDs
- Better user experience

### 2. SEO and Marketing
- Custom domains improve SEO
- Better for marketing and branding
- Professional appearance

### 3. Security
- Domain-based access is more secure
- Reduces exposure of internal IDs
- Better access control

### 4. Flexibility
- Supports both domain and header-based access
- Easy migration from header-based to domain-based
- Backward compatibility

## Setup Instructions

### 1. Database Migration

```bash
# Run the migration to add domain field
npx prisma migrate deploy
```

### 2. Create Project with Domain

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Company",
    "slug": "my-company",
    "domain": "mycompany.com",
    "dbConnectionString": "postgresql://...",
    "s3Bucket": "my-company-bucket",
    "s3Endpoint": "https://s3.amazonaws.com",
    "s3AccessKey": "access-key",
    "s3SecretKey": "secret-key"
  }'
```

### 3. Configure DNS

Point your domain to the Nexus server:
```
A record: mycompany.com -> <server-ip>
CNAME record: www.mycompany.com -> mycompany.com
```

### 4. SSL Certificate

Ensure HTTPS is configured for your domain:
- Use Let's Encrypt for free SSL
- Configure reverse proxy (nginx/Apache)
- Set up automatic certificate renewal

### 5. Test Access

```bash
# Test domain-based access
curl -X GET https://mycompany.com/health

# Test API endpoints
curl -X GET https://mycompany.com/iam/users \
  -H "Authorization: Bearer <access_token>"
```

## Security Considerations

### 1. Domain Validation
- Strict domain format validation
- Prevention of domain hijacking
- Normalization to prevent bypasses

### 2. Access Control
- Domain-based access is more secure
- Reduces exposure of internal project IDs
- Better audit trail

### 3. Rate Limiting
- Apply rate limiting per domain
- Prevent abuse of domain-based access
- Monitor for suspicious activity

## Monitoring and Logging

### 1. Domain Access Logs
- Log all domain-based access attempts
- Track successful and failed lookups
- Monitor for domain conflicts

### 2. Performance Metrics
- Track domain lookup performance
- Monitor database queries
- Cache frequently accessed domains

### 3. Error Handling
- Graceful fallback to header-based access
- Clear error messages for domain issues
- Proper HTTP status codes

## Future Enhancements

### 1. Subdomain Support
- Support for `api.mycompany.com`
- Automatic subdomain detection
- Wildcard domain support

### 2. Domain Management
- Domain verification system
- DNS record validation
- Domain ownership verification

### 3. Advanced Features
- Domain aliases
- Redirect handling
- Custom SSL certificates per domain

## Testing

Run the domain utility tests:

```bash
npm test src/__tests__/domainUtils.test.ts
```

Test domain-based access:

```bash
# Test with custom domain
curl -X GET https://mycompany.com/health

# Test with X-Project-ID fallback
curl -X GET http://localhost:3000/health \
  -H "X-Project-ID: project_123"
```

## Conclusion

The domain-based access feature significantly enhances the Nexus ERP system by providing:

- **Professional branding** for each tenant
- **Improved security** through domain-based access
- **Better user experience** with custom domains
- **Flexible access methods** with fallback support
- **Comprehensive validation** and error handling

This feature makes Nexus ERP a truly enterprise-ready multi-tenant SaaS platform that can compete with the best in the market.
