Let's build the foundation for an ambitious project called **"Nexus"**. Think of it as a modern, headless, and intelligent alternative to traditional ERPs like Odoo. The vibe is **API-first, modular, and built for performance and scalability from day one.**

Our main goal is to create a powerful **Core System** in **Express.js (with TypeScript)** that will serve as the backbone for countless business applications.

Let's get started. Here is the master plan.

-----

## **Project Initialization & Core Stack**

First, set up a new Express.js project using TypeScript.

  - **Language:** TypeScript (strict mode enabled).
  - **Framework:** Express.js.
  - **Database:** We'll use **Supabase**. It will serve as our primary **PostgreSQL** database and also our **Vector Database** (via the `pgvector` extension).
  - **ORM:** Use **Prisma** to connect to and interact with our Supabase Postgres instances. It's fully compatible.
  - **Authentication:** Use **JWT (JSON Web Tokens)** for securing the API.
  - **Validation:** Use `zod` for validating API inputs (request bodies, params, queries).
  - **Logging:** Integrate **`pino`** for structured, high-performance logging.
  - **Environment Variables:** Set up `dotenv` and create an `.env.example` file with Supabase variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and our app variables (`JWT_SECRET`, etc.).
  - **Initial Structure:** Create a clean, modular folder structure. Something like this would be great:

<!-- end list -->

```
/src
├── core                 # The Nexus Core functionalities
│   ├── auth
│   ├── iam              # Identity & Access Management
│   ├── tenants
│   ├── billing
│   └── notifications
├── apps                 # Placeholder for future business apps
├── shared               # Shared utilities, types, interfaces
├── middleware           # Custom Express middleware
├── config               # Project configuration
└── server.ts            # Main entry point
```

-----

## **Architectural Principles (Build with these in mind\!)**

These are not just features, they are the project's DNA. Please implement these principles throughout the codebase.

### **🛡️ Performance & Availability**

  - **Never Block the Event Loop:** Use `async/await` for all I/O operations (DB calls, external APIs).
  - **Robust Error Handling:**
      - Create a global error-handling middleware that catches all errors and returns a standardized JSON error response.
      - Wrap asynchronous route handlers in a utility function to catch unhandled promise rejections.
  - **High Availability Setup:**
      - Generate a `ecosystem.config.js` file for **PM2**. Configure it to run the application in **Cluster mode** to leverage all available CPU cores.
      - Include a `/health` check endpoint that returns a `200 OK` status.
  - **Essential Middleware:**
      - Add `helmet` for security headers.
      - Add `cors` with sensible default configurations.
      - Add `express-rate-limit` to prevent abuse.
      - Add `compression` to gzip responses.
  - **Database Performance:** Use Prisma's connection pooling by default. Add comments in the code where database indexes would be critical (e.g., on foreign keys or frequently queried columns).

### **🧩 Modularity & Interoperability**

The core idea is that "Apps" are independent but can communicate securely through the Nexus Core.

  - **Event Bus:**
      - Create a simple, in-memory event bus service within the Core (`/core/event-bus.ts`).
      - It should have `publish(eventName, payload)` and `subscribe(eventName, callback)` methods.
  - **Service Broker:**
      - Create a simple service registry in the Core (`/core/service-broker.ts`).
      - It should allow a module to register a function (`registerService`) and another module to call it securely (`callService`).

-----

## **Feature Generation: The Nexus Core**

Now, let's build the core features. Please generate the API endpoints (controllers/routes), services, and Prisma schemas for each module.

### **1. Identity & Access Management (IAM) Module (`/core/iam`)**

This is the security foundation.

  - **Prisma Schema:**
      - `User`: with fields for email, password (hashed), profile info.
      - `Role`: (e.g., 'admin', 'editor').
      - `Permission`: (e.g., 'create:invoice', 'read:document').
      - `Group`: with support for parent-child relationships (sub-groups).
      - Create many-to-many relations between: `User-Role`, `Role-Permission`, `User-Group`.
  - **User Authentication API:**
      - `POST /auth/register`: Create a new user.
      - `POST /auth/login`: Authenticate a user and return a JWT.
      - `POST /auth/refresh-token`: Get a new access token.
      - Implement middleware to protect routes, checking for a valid JWT.
  - **User & Group Management API (Protected):**
      - CRUD endpoints for Users (`/users`).
      - CRUD endpoints for Groups (`/groups`), including adding/removing users from groups.
      - CRUD for Roles and Permissions (`/roles`, `/permissions`).
  - **Access Control:**
      - Create a permission-checking middleware `can(permission: string)` that verifies if the authenticated user has the required permission through their roles.

### **2. Multi-Tenancy Module (`/core/tenants`)**

 

Nexus is a multi-tenant SaaS. We'll use a **resource-per-tenant** strategy for full data and file isolation.

  - **Prisma Schema (in the main DB):**
      - `Project` (or `Tenant`): Represents a client's workspace. It should store:
          - `name`: The project's name.
          - `dbConnectionString`: The dedicated connection string for the tenant's PostgreSQL database. // Stored encrypted
          - `s3Bucket`: The name of the dedicated S3-compatible bucket.
          - `s3Endpoint`: The endpoint URL for the S3 service.
          - `s3AccessKey`: The access key for the S3 bucket. // Stored encrypted
          - `s3SecretKey`: The secret key for the S3 bucket. // Stored encrypted
  - **Logic:**
      - The "main" database contains the `User` and `Project` tables.
      - When a user makes an API request, a middleware should:
        1.  Identify the project (e.g., via a header like `X-Project-ID`).
        2.  Fetch the project's details from the main DB.
        3.  **Dynamically create a tenant-specific Prisma Client instance** using `dbConnectionString` and attach it to the request (`req.prisma`).
        4.  **Dynamically create a tenant-specific S3 client instance** (using a library like `aws-sdk`) with the project's S3 credentials and attach it to the request (`req.s3`).
      - All subsequent logic will use `req.prisma` and `req.s3`, ensuring it operates only on that tenant's dedicated resources.

### **3. Unified Notifications Module (`/core/notifications`)**

One service to rule them all.

  - **Service Layer:**
      - Create a `NotificationService` with a single method: `send(notification)`.
  - **Provider-Based Architecture:**
      - Create a `/providers` sub-directory with placeholder providers (`email.ts`, `sms.ts`) that just log to the console.

### **4. Billing & Monetization Module (`/core/billing`)**

  - **Prisma Schema (in the tenant DB):**
      - `Plan` & `Subscription`.
  - **Payment Gateway Architecture:**
      - Create a plugin-based system with placeholder providers (`StripeProvider.ts`, etc.).
  - **API Endpoints:**
      - `GET /billing/subscription`, `POST /billing/portal`.

### **5. AI & Federated Search Layer (`/core/ai`)**

**(UPDATED SECTION)**

  - **LLM Connection Manager (Tenant-Aware):**
      - The system must support both a global (Nexus-provided) LLM and tenant-specific LLM configurations.
      - **Update the `Project` (Tenant) schema** in the main DB to include:
          - `llmProvider`: An enum, e.g., `NEXUS`, `OPENAI`, `ANTHROPIC`. Defaults to `NEXUS`.
          - `llmApiKey`: An optional, encrypted string for the tenant's own API key.
      - **Create a `LLMService`**. When a request needs an LLM:
        1.  The service checks the current project's `llmProvider`.
        2.  If `NEXUS`, it uses the global API keys from the main `.env` file.
        3.  If `OPENAI` or another, it uses the `llmApiKey` stored for that specific project.
        4.  This service should provide a simple `getCompletion(prompt)` method that handles this logic internally.
  - **Token Tracking:**
      - Create a logging mechanism or a DB table (`ApiCallLog` in the tenant DB) to track every outgoing call to an LLM, recording the tenant, provider, and tokens used.
  - **Federated Search Endpoint:**
      - `POST /search`: Create a single endpoint for global search.
      - In the service, simulate the logic:
        1.  Log the query.
        2.  **Publish an event** on the event bus: `search.requested`, with the query as the payload.
        3.  Return a placeholder response.

-----

## **Final Output**

Please generate the complete project with all the modules, services, API routes, and Prisma schemas described above. Ensure the code is well-commented, especially where there are placeholders for future integrations (like payment gateways or notification providers) and where sensitive data handling (encryption for keys) is required.

Include a **`README.md`** file that explains the project structure, how to set up the environment (`.env`), and how to run the project.

Let's build this powerful and flexible core\! 🚀