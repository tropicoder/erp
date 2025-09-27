# Nexus ERP

A modern, headless, API-first ERP system built with Express.js and TypeScript. Nexus is designed for performance, scalability, and modularity from day one.

## 🚀 Features

### Core Capabilities
- **Multi-Tenant Architecture**: Complete data isolation with dedicated databases and storage per tenant
- **Identity & Access Management**: Role-based permissions with granular access control
- **Authentication & Authorization**: JWT-based authentication with refresh tokens
- **Event-Driven Architecture**: In-memory event bus for inter-module communication
- **Service Broker**: Inter-module service registry and communication
- **Unified Notifications**: Multi-channel notification system (Email, SMS, Push)
- **Core-Based Billing**: Centralized billing with user-based and application-based pricing
- **AI & Search**: LLM integration with federated search capabilities

### Technical Highlights
- **TypeScript**: Strict mode enabled for type safety
- **Express.js**: High-performance web framework
- **Prisma ORM**: Type-safe database access with connection pooling
- **Supabase**: PostgreSQL database with vector support
- **JWT Authentication**: Secure token-based authentication
- **Zod Validation**: Runtime type validation for API inputs
- **Pino Logging**: High-performance structured logging
- **PM2 Clustering**: Production-ready process management

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- PostgreSQL database (or Supabase account)
- npm or yarn package manager

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nexus-erp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_REFRESH_SECRET=your-super-secret-refresh-key-here

   # Database Configuration
   DATABASE_URL=postgresql://postgres:password@localhost:5432/nexus_main
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

   # Encryption
   ENCRYPTION_KEY=your-32-character-encryption-key-here

   # LLM Configuration
   OPENAI_API_KEY=your-openai-api-key
   ANTHROPIC_API_KEY=your-anthropic-api-key
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma client
   npm run prisma:generate

   # Run database migrations
   npm run prisma:migrate
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
# Build first
npm run build

# Start with PM2
npm run pm2:start

# Or start directly
npm start
```

### Using PM2 (Recommended for Production)
```bash
# Start application
npm run pm2:start

# Stop application
npm run pm2:stop

# Restart application
npm run pm2:restart

# View logs
pm2 logs nexus-erp

# Monitor
pm2 monit
```

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Refresh Token
```http
POST /auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}
```

#### Get Current User
```http
GET /auth/me
Authorization: Bearer your-access-token
```

### Tenant Management

#### Create Project/Tenant
```http
POST /tenants
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "name": "My Company",
  "slug": "my-company",
  "domain": "mycompany.com",
  "dbConnectionString": "postgresql://...",
  "s3Bucket": "my-company-bucket",
  "s3Endpoint": "https://s3.amazonaws.com",
  "s3AccessKey": "access-key",
  "s3SecretKey": "secret-key"
}
```

#### Get Project Details
```http
GET /tenants/{projectId}
Authorization: Bearer your-access-token
X-Project-ID: {projectId}
```

### Identity & Access Management

#### Get Users
```http
GET /iam/users
Authorization: Bearer your-access-token
X-Project-ID: {projectId}
```

#### Create Role
```http
POST /iam/roles
Authorization: Bearer your-access-token
X-Project-ID: {projectId}
Content-Type: application/json

{
  "name": "admin",
  "description": "Administrator role",
  "permissionIds": ["perm1", "perm2"]
}
```

### Notifications

#### Send Notification
```http
POST /notifications/send
Authorization: Bearer your-access-token
X-Project-ID: {projectId}
Content-Type: application/json

{
  "type": "email",
  "recipient": "user@example.com",
  "subject": "Welcome!",
  "body": "Welcome to our platform!"
}
```

### Core-Based Billing

#### Create Subscription
```http
POST /billing/subscriptions
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "projectId": "proj_123",
  "userPricePerMonth": 10.00,
  "applicationPricePerMonth": 0.00
}
```

#### Get Billing Status
```http
GET /billing/subscriptions/{projectId}
Authorization: Bearer your-access-token
```

#### Process Payment
```http
POST /billing/payments/process
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "invoiceId": "inv_123",
  "paymentMethod": "stripe"
}
```

#### Get Invoices
```http
GET /billing/invoices/{projectId}?page=1&limit=10
Authorization: Bearer your-access-token
```

### AI & Search

#### Get LLM Completion
```http
POST /ai/completion
Authorization: Bearer your-access-token
X-Project-ID: {projectId}
Content-Type: application/json

{
  "prompt": "Explain quantum computing",
  "maxTokens": 1000,
  "temperature": 0.7
}
```

#### Federated Search
```http
POST /ai/search
Authorization: Bearer your-access-token
X-Project-ID: {projectId}
Content-Type: application/json

{
  "query": "user management",
  "limit": 20,
  "filters": {
    "type": "document"
  }
}
```

## 🌐 Domain-Based Access

Nexus supports custom domain access for each tenant, allowing users to access their SaaS through their own domain names.

### How It Works

1. **Domain Configuration**: When creating a project, you can specify a custom domain
2. **Automatic Detection**: The system automatically detects the project based on the request domain
3. **Fallback to Header**: If no domain match is found, the system falls back to the `X-Project-ID` header

### Example Usage

```bash
# Access via custom domain
curl -X GET https://mycompany.com/api/iam/users \
  -H "Authorization: Bearer <access_token>"

# Access via X-Project-ID header (fallback)
curl -X GET https://api.nexus.com/iam/users \
  -H "Authorization: Bearer <access_token>" \
  -H "X-Project-ID: project_123"
```

### Domain Setup

1. **Create Project with Domain**:
```json
{
  "name": "My Company",
  "slug": "my-company",
  "domain": "mycompany.com",
  // ... other fields
}
```

2. **Configure DNS**: Point your domain to the Nexus server
3. **SSL Certificate**: Ensure HTTPS is configured for your domain
4. **Access**: Users can now access their SaaS at `https://mycompany.com`

## 🏗️ Architecture

### Project Structure
```
src/
├── core/                    # Core business logic
│   ├── auth/               # Authentication services
│   ├── iam/                # Identity & Access Management
│   ├── tenants/            # Multi-tenancy management
│   ├── billing/            # Billing and payments
│   ├── notifications/      # Notification system
│   └── ai/                 # AI and search services
├── shared/                 # Shared utilities and types
│   ├── database/           # Database clients
│   ├── utils/              # Utility functions
│   └── routes/             # Shared routes
├── middleware/             # Express middleware
├── config/                 # Configuration
└── server.ts              # Main application entry point
```

### Multi-Tenancy Architecture

Nexus uses a **resource-per-tenant** strategy:

1. **Main Database**: Stores users, projects, and global configuration
2. **Tenant Databases**: Each tenant has a dedicated PostgreSQL database
3. **Tenant Storage**: Each tenant has dedicated S3-compatible storage
4. **Dynamic Clients**: Prisma and S3 clients are created dynamically per request
5. **Domain-Based Access**: Tenants can be accessed via custom domains or X-Project-ID header

### Core-Based Billing Philosophy

Nexus implements a **centralized billing model** where billing is managed at the platform level:

1. **User-Based Pricing**: $10.00 per active user per month
2. **Application-Based Pricing**: Variable pricing per application (0 to unlimited)
3. **Prorated Billing**: New users are billed prorated for remaining days in the month
4. **Automatic Billing**: Monthly billing on the last day of each month
5. **Automatic Enforcement**: Tenants are automatically deactivated for non-payment
6. **Centralized Management**: All billing data stored in main database

### Event-Driven Architecture

- **Event Bus**: In-memory event system for inter-module communication
- **Service Broker**: Service registry for module-to-module calls
- **Event Types**: Standardized event names for type safety

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server with hot reload
npm run build            # Build TypeScript to JavaScript
npm start               # Start production server

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint errors
npm run format          # Format code with Prettier

# Testing
npm test                # Run tests
npm run test:watch      # Run tests in watch mode

# Database
npm run prisma:generate # Generate Prisma client
npm run prisma:migrate  # Run database migrations
npm run prisma:studio   # Open Prisma Studio

# PM2
npm run pm2:start       # Start with PM2
npm run pm2:stop        # Stop PM2 processes
npm run pm2:restart     # Restart PM2 processes
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `NODE_ENV` | Environment | No (default: development) |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_REFRESH_SECRET` | JWT refresh secret | Yes |
| `DATABASE_URL` | Main database URL | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `ENCRYPTION_KEY` | Data encryption key | Yes |
| `OPENAI_API_KEY` | OpenAI API key | No |
| `ANTHROPIC_API_KEY` | Anthropic API key | No |

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

### Test Structure
- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test API endpoints and database interactions
- **Mock Services**: External services are mocked for testing

## 🚀 Deployment

### Production Checklist

1. **Environment Setup**
   - Set `NODE_ENV=production`
   - Configure production database URLs
   - Set strong JWT secrets
   - Configure encryption keys

2. **Database Setup**
   - Run migrations: `npm run prisma:migrate`
   - Set up connection pooling
   - Configure backups

3. **Security**
   - Enable HTTPS
   - Configure CORS properly
   - Set up rate limiting
   - Use environment variables for secrets

4. **Monitoring**
   - Set up logging aggregation
   - Configure health checks
   - Monitor PM2 processes
   - Set up error tracking

### Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

### PM2 Configuration

The application includes a `ecosystem.config.js` file for PM2:

- **Cluster Mode**: Utilizes all CPU cores
- **Auto Restart**: Restarts on crashes
- **Memory Management**: Restarts if memory usage exceeds 1GB
- **Logging**: Structured logging to files

## 🔒 Security

### Authentication & Authorization
- JWT tokens with configurable expiration
- Refresh token rotation
- Role-based access control (RBAC)
- Permission-based middleware

### Data Protection
- Password hashing with bcrypt
- Sensitive data encryption at rest
- Tenant data isolation
- Input validation with Zod

### API Security
- Rate limiting
- CORS configuration
- Security headers with Helmet
- Request validation

## 📊 Monitoring & Logging

### Logging
- Structured logging with Pino
- Request/response logging
- Error tracking
- Performance metrics

### Health Checks
- `/health` endpoint for monitoring
- Database connectivity checks
- Service health monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API examples

## 📚 Documentation

- [API Documentation](docs/API.md) - Complete API reference with examples
- [Domain Feature](docs/DOMAIN_FEATURE.md) - Custom domain access guide
- [Billing Philosophy](docs/BILLING_PHILOSOPHY.md) - Core-based billing system

## 🗺️ Roadmap

### Planned Features
- [ ] Real-time notifications with WebSockets
- [ ] Advanced analytics and reporting
- [ ] Workflow automation engine
- [ ] Mobile SDK
- [ ] GraphQL API
- [ ] Advanced caching with Redis
- [ ] Microservices architecture
- [ ] Kubernetes deployment guides

---

**Built with ❤️ by the Nexus Team**
