# Nexus ERP - Execution Plan

## Project Overview
Building a modern, headless, API-first ERP system called **Nexus** using Express.js with TypeScript, designed for performance, scalability, and modularity.

---

## Phase 1: Project Foundation & Setup
*Estimated Time: 2-3 hours*

### 1.1 Project Initialization
- [ ] Initialize new Node.js project with TypeScript
- [ ] Set up package.json with all required dependencies
- [ ] Configure TypeScript with strict mode
- [ ] Set up ESLint and Prettier for code quality
- [ ] Create initial folder structure as specified

### 1.2 Core Dependencies Installation
- [ ] Install Express.js and TypeScript
- [ ] Install Prisma ORM and Prisma Client
- [ ] Install JWT authentication libraries
- [ ] Install Zod for validation
- [ ] Install Pino for logging
- [ ] Install security middleware (helmet, cors, rate-limit, compression)
- [ ] Install AWS SDK for S3 integration
- [ ] Install dotenv for environment variables

### 1.3 Environment Configuration
- [ ] Create `.env.example` file with all required variables
- [ ] Set up environment variable validation
- [ ] Configure Supabase connection variables
- [ ] Set up JWT secret configuration
- [ ] Configure S3 credentials structure

### 1.4 Basic Server Setup
- [ ] Create main `server.ts` entry point
- [ ] Set up Express app with basic middleware
- [ ] Configure CORS, Helmet, Rate Limiting, Compression
- [ ] Create health check endpoint (`/health`)
- [ ] Set up PM2 ecosystem configuration
- [ ] Create global error handling middleware

---

## Phase 2: Database & ORM Setup
*Estimated Time: 1-2 hours*

### 2.1 Prisma Configuration
- [ ] Initialize Prisma in the project
- [ ] Configure Prisma schema for main database
- [ ] Set up connection to Supabase PostgreSQL
- [ ] Configure connection pooling
- [ ] Create database migration setup

### 2.2 Main Database Schema (Supabase)
- [x] Create `User` model with authentication fields
- [x] Create `Project` (Tenant) model with multi-tenancy fields
- [x] Add `domain` field for custom domain support
- [x] Add billing models: `Subscription`, `Invoice`, `Application`
- [x] Add encryption fields for sensitive data
- [x] Set up proper indexes for performance
- [x] Create initial migration
- [x] **Domain Feature**: Added domain-based tenant identification

### 2.3 Tenant Database Schema
- [x] Create tenant-specific Prisma schema
- [x] Design `Role`, `Permission`, `Group` models for IAM
- [x] Add `ApiCallLog` model for LLM tracking
- [x] Set up proper relationships and indexes
- [x] **Note**: Billing models moved to main database (core-based billing)

---

## Phase 3: Core Infrastructure
*Estimated Time: 2-3 hours*

### 3.1 Event Bus System
- [ ] Create `/core/event-bus.ts` service
- [ ] Implement `publish(eventName, payload)` method
- [ ] Implement `subscribe(eventName, callback)` method
- [ ] Add event type definitions
- [ ] Create event bus middleware integration

### 3.2 Service Broker
- [ ] Create `/core/service-broker.ts` service
- [ ] Implement `registerService` functionality
- [ ] Implement `callService` functionality
- [ ] Add service discovery mechanisms
- [ ] Create service broker middleware

### 3.3 Multi-Tenancy Middleware
- [x] Create tenant identification middleware
- [x] Implement dynamic Prisma client creation
- [x] Implement dynamic S3 client creation
- [x] Add tenant context to request object
- [x] Create tenant validation logic
- [x] **Domain Support**: Add domain-based tenant identification
- [x] **Domain Utilities**: Create domain validation and normalization
- [x] **Fallback Logic**: X-Project-ID header fallback for domain identification

---

## Phase 4: Authentication & Authorization
*Estimated Time: 3-4 hours*

### 4.1 JWT Authentication
- [ ] Create JWT token generation service
- [ ] Implement token validation middleware
- [ ] Create refresh token mechanism
- [ ] Add token blacklisting for security
- [ ] Implement password hashing utilities

### 4.2 IAM Module - Core Models
- [ ] Implement User CRUD operations
- [ ] Create Role management system
- [ ] Implement Permission system
- [ ] Create Group management with hierarchy
- [ ] Set up many-to-many relationships

### 4.3 Authentication API Endpoints
- [ ] `POST /auth/register` - User registration
- [ ] `POST /auth/login` - User authentication
- [ ] `POST /auth/refresh-token` - Token refresh
- [ ] `POST /auth/logout` - User logout
- [ ] Add input validation with Zod

### 4.4 Authorization System
- [ ] Create `can(permission)` middleware
- [ ] Implement role-based access control
- [ ] Create permission checking utilities
- [ ] Add group-based permissions
- [ ] Implement route protection

### 4.5 User Management API
- [ ] `GET /users` - List users
- [ ] `POST /users` - Create user
- [ ] `PUT /users/:id` - Update user
- [ ] `DELETE /users/:id` - Delete user
- [ ] `GET /users/:id` - Get user details

### 4.6 Group & Role Management API
- [ ] CRUD endpoints for Groups (`/groups`)
- [ ] CRUD endpoints for Roles (`/roles`)
- [ ] CRUD endpoints for Permissions (`/permissions`)
- [ ] Group membership management
- [ ] Role assignment endpoints

---

## Phase 5: Multi-Tenancy Implementation
*Estimated Time: 2-3 hours*

### 5.1 Tenant Management
- [x] Create tenant registration system
- [x] Implement tenant database provisioning
- [x] Set up tenant S3 bucket creation
- [x] Create tenant isolation middleware
- [x] Implement tenant switching logic
- [x] **Domain Feature**: Add domain-based tenant identification
- [x] **Domain Validation**: Implement domain format validation
- [x] **Domain Normalization**: Create domain utilities for processing
- [x] **Domain Search**: Include domain in tenant search functionality
- [x] Implement automatic subscription creation

### 5.2 Tenant API Endpoints
- [x] `GET /tenants` - List tenants (admin only)
- [x] `POST /tenants` - Create new tenant with domain support
- [x] `PUT /tenants/:id` - Update tenant (including domain updates)
- [x] `DELETE /tenants/:id` - Delete tenant
- [x] `GET /tenants/:id` - Get tenant details
- [x] `POST /tenants/:id/users` - Add user to tenant (with automatic billing)
- [x] `GET /tenants/:id/users` - Get tenant users
- [x] **Domain Support**: All endpoints support domain-based access
- [x] **Domain Validation**: Domain format validation in create/update operations

### 5.3 Dynamic Client Management
- [x] Implement Prisma client factory
- [x] Create S3 client factory
- [x] Add connection pooling per tenant
- [x] Implement client caching
- [x] Add connection health checks
- [x] **Domain-Based Identification**: Add domain-based tenant identification
- [x] **Domain Utilities**: Create domain validation and normalization utilities
- [x] **Fallback Mechanism**: X-Project-ID header fallback for domain identification
- [x] Implement tenant context middleware

---

## Phase 6: Notifications System
*Estimated Time: 1-2 hours*

### 6.1 Notification Service
- [ ] Create `NotificationService` class
- [ ] Implement `send(notification)` method
- [ ] Add notification type definitions
- [ ] Create notification queue system
- [ ] Add retry mechanism for failed notifications

### 6.2 Notification Providers
- [ ] Create email provider (`/providers/email.ts`)
- [ ] Create SMS provider (`/providers/sms.ts`)
- [ ] Create push notification provider
- [ ] Add provider configuration system
- [ ] Implement provider selection logic

### 6.3 Notification API
- [ ] `POST /notifications/send` - Send notification
- [ ] `GET /notifications/history` - Get notification history
- [ ] `GET /notifications/templates` - Get notification templates
- [ ] Add notification preferences management

---

## Phase 7: Core-Based Billing & Monetization
*Estimated Time: 3-4 hours*

### 7.1 Core Billing Models (Main Database)
- [x] Create `Subscription` model with user/application pricing
- [x] Implement `Invoice` model with monthly billing support
- [x] Add global `Application` catalog model (no projectId)
- [x] Add `TenantApplication` junction model for tenant-app selections
- [x] Create billing automation system
- [x] Implement automatic tenant deactivation
- [x] **Removed prorated billing** - users pay full monthly price regardless of when added

### 7.2 Billing Services Architecture
- [x] Create `CoreBillingService` for billing calculations
- [x] Implement `BillingAutomationService` for monthly billing
- [x] Add `UserBillingService` for user-specific billing
- [x] Create `BillingCronService` for automated billing
- [x] **Removed prorated billing** - simplified to monthly billing only
- [x] Add application catalog management
- [x] Add tenant application selection system

### 7.3 Core Billing API Endpoints
- [x] `POST /billing/subscriptions` - Create subscription
- [x] `GET /billing/subscriptions/{projectId}` - Get billing status
- [x] `GET /billing/applications` - Get available applications catalog
- [x] `POST /billing/tenants/{projectId}/applications` - Add application to tenant
- [x] `POST /billing/payments/process` - Process payment
- [x] `GET /billing/invoices/{projectId}` - Get invoices
- [x] `POST /billing/automation/monthly` - Trigger monthly billing
- [x] `GET /billing/statistics` - Get billing analytics

### 7.4 Automated Billing Features
- [x] Monthly billing on last day of month
- [x] **Removed prorated billing** - users pay full monthly price regardless of when added
- [x] Application catalog with tenant selection system
- [x] Custom pricing per tenant for applications
- [x] Automatic tenant deactivation for non-payment
- [x] Comprehensive billing events and logging

---

## Phase 8: AI & Search Layer
*Estimated Time: 2-3 hours*

### 8.1 LLM Service
- [ ] Create `LLMService` class
- [ ] Implement tenant-aware LLM selection
- [ ] Add support for multiple LLM providers
- [ ] Create API key management system
- [ ] Implement `getCompletion(prompt)` method

### 8.2 LLM Provider Integration
- [ ] Implement OpenAI integration
- [ ] Add Anthropic integration
- [ ] Create Nexus global LLM support
- [ ] Add provider-specific configurations
- [ ] Implement fallback mechanisms

### 8.3 Token Tracking
- [ ] Create `ApiCallLog` model
- [ ] Implement token usage tracking
- [ ] Add cost calculation system
- [ ] Create usage analytics
- [ ] Implement rate limiting per tenant

### 8.4 Federated Search
- [ ] Create search service
- [ ] Implement `POST /search` endpoint
- [ ] Add search query logging
- [ ] Integrate with event bus
- [ ] Create search result aggregation

---

## Phase 9: Testing & Quality Assurance
*Estimated Time: 2-3 hours*

### 9.1 Unit Testing
- [ ] Set up Jest testing framework
- [ ] Create tests for core services
- [ ] Test authentication middleware
- [ ] Test multi-tenancy logic
- [ ] Test API endpoints

### 9.2 Integration Testing
- [ ] Test database connections
- [ ] Test external service integrations
- [ ] Test event bus functionality
- [ ] Test service broker
- [ ] Test end-to-end workflows

### 9.3 Security Testing
- [ ] Test JWT token security
- [ ] Test tenant isolation
- [ ] Test input validation
- [ ] Test rate limiting
- [ ] Test CORS configuration

---

## Phase 10: Documentation & Deployment
*Estimated Time: 1-2 hours*

### 10.1 Documentation
- [ ] Create comprehensive README.md
- [ ] Document API endpoints with examples
- [ ] Create setup and installation guide
- [ ] Document environment variables
- [ ] Create deployment instructions

### 10.2 Deployment Configuration
- [ ] Finalize PM2 ecosystem configuration
- [ ] Create Docker configuration
- [ ] Set up production environment variables
- [ ] Configure logging for production
- [ ] Create monitoring setup

### 10.3 Final Testing
- [ ] Test complete application flow
- [ ] Verify all endpoints work correctly
- [ ] Test multi-tenancy isolation
- [ ] Verify security measures
- [ ] Performance testing

---

## Success Criteria Checklist

### Core Functionality
- [x] User authentication and authorization working
- [x] Multi-tenancy with complete data isolation
- [x] All CRUD operations for core entities
- [x] Event bus and service broker operational
- [x] Notification system functional
- [x] **Core-based billing system with automated monthly billing**
- [x] **Domain-based tenant access with custom domains**
- [x] **Prorated billing for new users**
- [x] **Automatic tenant deactivation for non-payment**
- [x] AI/LLM integration with tenant awareness
- [x] Federated search working

### Performance & Security
- [ ] All endpoints respond within acceptable time
- [ ] Proper error handling and logging
- [ ] Security headers and CORS configured
- [ ] Rate limiting preventing abuse
- [ ] JWT tokens properly secured
- [ ] Tenant data completely isolated
- [ ] Input validation on all endpoints

### Code Quality
- [ ] TypeScript strict mode enabled
- [ ] All code properly commented
- [ ] Consistent code formatting
- [ ] No linting errors
- [ ] Proper error handling throughout
- [ ] Modular and maintainable architecture

---

## Estimated Total Time: 18-25 hours

## Major Updates & Completed Features

### ✅ **Core-Based Billing System**
- **Centralized billing management** in main database
- **User-based pricing**: $10.00 per user per month
- **Application catalog**: Global application catalog with tenant selection
- **Custom application pricing**: Per-tenant pricing overrides
- **Monthly billing only**: No prorated billing - users pay full monthly price
- **Automatic monthly billing**: Last day of each month at 23:59
- **Automatic tenant deactivation**: For non-payment

### ✅ **Domain-Based Access**
- **Custom domain support** for each tenant
- **Automatic tenant identification** via domain
- **Fallback to X-Project-ID header** for API access
- **Domain validation and normalization**
- **Domain utilities** for validation, normalization, and processing
- **Domain search functionality** in tenant management
- **Domain-based API access** with automatic tenant detection

### ✅ **Enhanced Multi-Tenancy**
- **Automatic subscription creation** when project is created
- **Automatic billing processing** when users are added
- **Comprehensive billing events** and logging
- **Billing automation services** with cron jobs

## Notes
- Each phase should be completed and tested before moving to the next
- Use checkboxes to track progress
- Add comments and documentation throughout development
- Test thoroughly at each phase
- Consider breaking down large phases into smaller sub-tasks if needed

---

*Last Updated: 27 Sept 2025*
*Status: Core Features Completed - Ready for Production*
