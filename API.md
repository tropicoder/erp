# Nexus ERP API Documentation

## Overview

The Nexus ERP API is a RESTful API built with Express.js and TypeScript. It provides comprehensive functionality for multi-tenant ERP operations including authentication, user management, billing, notifications, and AI-powered search.

## Base URL

```
http://localhost:3000
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the access token in the Authorization header:

```
Authorization: Bearer <access_token>
```

For tenant-specific operations, include the project ID in the header:

```
X-Project-ID: <project_id>
```

## Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

## Endpoints

### Health Check

#### GET /health
Check the health status of the API.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "OK",
    "timestamp": "2023-12-01T10:00:00.000Z",
    "uptime": 3600,
    "environment": "development",
    "version": "1.0.0",
    "memory": {
      "used": 45.2,
      "total": 128.0
    },
    "cpu": {
      "loadAverage": [0.5, 0.3, 0.2]
    }
  }
}
```

### Authentication

#### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "createdAt": "2023-12-01T10:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": "15m"
    }
  }
}
```

#### POST /auth/login
Authenticate a user and receive access tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": "15m"
    }
  }
}
```

#### POST /auth/refresh-token
Refresh an expired access token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "15m"
  }
}
```

#### GET /auth/me
Get current user information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "avatar": null,
      "isActive": true,
      "createdAt": "2023-12-01T10:00:00.000Z",
      "updatedAt": "2023-12-01T10:00:00.000Z"
    }
  }
}
```

### Tenant Management

#### GET /tenants
Get all projects/tenants (admin only).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search term

**Response:**
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "project_123",
        "name": "My Company",
        "slug": "my-company",
        "isActive": true,
        "createdAt": "2023-12-01T10:00:00.000Z",
        "users": [
          {
            "id": "user_project_123",
            "userId": "user_123",
            "role": "admin",
            "joinedAt": "2023-12-01T10:00:00.000Z",
            "user": {
              "id": "user_123",
              "email": "admin@example.com",
              "firstName": "Admin",
              "lastName": "User"
            }
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "pages": 1
    }
  }
}
```

#### POST /tenants
Create a new project/tenant.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "My Company",
  "slug": "my-company",
  "dbConnectionString": "postgresql://user:pass@host:5432/db",
  "s3Bucket": "my-company-bucket",
  "s3Endpoint": "https://s3.amazonaws.com",
  "s3AccessKey": "access-key",
  "s3SecretKey": "secret-key",
  "llmProvider": "NEXUS",
  "llmApiKey": "optional-api-key"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Project created successfully",
  "data": {
    "project": {
      "id": "project_123",
      "name": "My Company",
      "slug": "my-company",
      "isActive": true,
      "createdAt": "2023-12-01T10:00:00.000Z"
    }
  }
}
```

### Identity & Access Management

#### GET /iam/users
Get all users in the tenant.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `search` (optional): Search term

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user_123",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "isActive": true,
        "createdAt": "2023-12-01T10:00:00.000Z",
        "roles": [
          {
            "id": "user_role_123",
            "roleId": "role_123",
            "role": {
              "id": "role_123",
              "name": "admin",
              "description": "Administrator role"
            }
          }
        ],
        "groups": []
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "pages": 1
    }
  }
}
```

#### POST /iam/roles
Create a new role.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Request Body:**
```json
{
  "name": "editor",
  "description": "Content editor role",
  "permissionIds": ["perm_123", "perm_456"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Role created successfully",
  "data": {
    "role": {
      "id": "role_123",
      "name": "editor",
      "description": "Content editor role",
      "isActive": true,
      "createdAt": "2023-12-01T10:00:00.000Z",
      "permissions": [
        {
          "id": "role_permission_123",
          "permissionId": "perm_123",
          "permission": {
            "id": "perm_123",
            "name": "read:documents",
            "description": "Read documents",
            "resource": "documents",
            "action": "read"
          }
        }
      ]
    }
  }
}
```

### Notifications

#### POST /notifications/send
Send a notification.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Request Body:**
```json
{
  "type": "email",
  "recipient": "user@example.com",
  "subject": "Welcome!",
  "body": "Welcome to our platform!",
  "metadata": {
    "priority": "high"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notification sent successfully",
  "data": {
    "notification": {
      "id": "notif_123",
      "type": "email",
      "recipient": "user@example.com",
      "status": "SENT",
      "sentAt": "2023-12-01T10:00:00.000Z"
    },
    "result": {
      "success": true,
      "messageId": "msg_123",
      "provider": "email"
    }
  }
}
```

#### GET /notifications/history
Get notification history.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `type` (optional): Filter by type
- `status` (optional): Filter by status
- `recipient` (optional): Filter by recipient

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif_123",
        "templateId": "template_123",
        "recipient": "user@example.com",
        "type": "email",
        "status": "SENT",
        "sentAt": "2023-12-01T10:00:00.000Z",
        "errorMessage": null,
        "metadata": {},
        "createdAt": "2023-12-01T10:00:00.000Z",
        "template": {
          "id": "template_123",
          "name": "welcome-email",
          "type": "email"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "pages": 1
    }
  }
}
```

### Billing

#### GET /billing/plans
Get all available plans.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "plan_123",
        "name": "Pro Plan",
        "description": "Professional plan with advanced features",
        "price": 99.99,
        "currency": "USD",
        "interval": "monthly",
        "features": {
          "users": 100,
          "storage": "100GB",
          "support": "priority"
        },
        "isActive": true,
        "createdAt": "2023-12-01T10:00:00.000Z"
      }
    ]
  }
}
```

#### POST /billing/subscribe
Create a subscription.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Request Body:**
```json
{
  "planId": "plan_123",
  "provider": "stripe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription created successfully",
  "data": {
    "subscription": {
      "id": "sub_123",
      "planId": "plan_123",
      "status": "active",
      "currentPeriodStart": "2023-12-01T10:00:00.000Z",
      "currentPeriodEnd": "2024-01-01T10:00:00.000Z",
      "cancelAtPeriodEnd": false,
      "createdAt": "2023-12-01T10:00:00.000Z",
      "plan": {
        "id": "plan_123",
        "name": "Pro Plan",
        "price": 99.99,
        "currency": "USD",
        "interval": "monthly"
      }
    },
    "transactionId": "txn_123"
  }
}
```

### AI & Search

#### POST /ai/completion
Get LLM completion.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Request Body:**
```json
{
  "prompt": "Explain quantum computing in simple terms",
  "maxTokens": 1000,
  "temperature": 0.7,
  "model": "gpt-3.5-turbo",
  "systemMessage": "You are a helpful assistant."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "content": "Quantum computing is a revolutionary approach to processing information...",
    "usage": {
      "promptTokens": 25,
      "completionTokens": 150,
      "totalTokens": 175
    },
    "model": "gpt-3.5-turbo"
  }
}
```

#### POST /ai/search
Execute federated search.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Request Body:**
```json
{
  "query": "user management",
  "limit": 20,
  "offset": 0,
  "filters": {
    "type": "document"
  },
  "sortBy": "relevance",
  "sortOrder": "desc"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "doc_123",
        "title": "User Management Guide",
        "content": "Complete guide to managing users, roles, and permissions...",
        "type": "document",
        "score": 0.95,
        "metadata": {
          "category": "User Guide",
          "author": "Support Team"
        },
        "createdAt": "2023-12-01T10:00:00.000Z",
        "updatedAt": "2023-12-01T10:00:00.000Z"
      }
    ],
    "total": 1,
    "query": "user management",
    "took": 150
  }
}
```

#### GET /ai/usage
Get LLM usage statistics.

**Headers:**
```
Authorization: Bearer <access_token>
X-Project-ID: <project_id>
```

**Query Parameters:**
- `days` (optional): Number of days to look back (default: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "30 days",
    "totalCalls": 150,
    "totalTokens": 25000,
    "totalCost": 0.50,
    "averageResponseTime": 1200,
    "successRate": 98.5,
    "providerBreakdown": {
      "openai": {
        "calls": 100,
        "tokens": 15000,
        "cost": 0.30,
        "successRate": 99.0
      },
      "anthropic": {
        "calls": 50,
        "tokens": 10000,
        "cost": 0.20,
        "successRate": 98.0
      }
    }
  }
}
```

## Error Handling

### Common Error Responses

#### Validation Error (400)
```json
{
  "success": false,
  "message": "Validation Error",
  "error": "Invalid email address"
}
```

#### Unauthorized (401)
```json
{
  "success": false,
  "message": "Access token required"
}
```

#### Forbidden (403)
```json
{
  "success": false,
  "message": "Permission denied: create:users"
}
```

#### Not Found (404)
```json
{
  "success": false,
  "message": "User not found"
}
```

#### Rate Limited (429)
```json
{
  "success": false,
  "message": "Too many requests from this IP, please try again later."
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Window**: 15 minutes
- **Limit**: 100 requests per IP
- **Headers**: Rate limit information is included in response headers

## Pagination

Many endpoints support pagination:

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

**Response Format:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "pages": 10
    }
  }
}
```

## SDKs and Libraries

### JavaScript/TypeScript
```javascript
// Example API client usage
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const data = await response.json();
```

### cURL Examples
```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Get current user
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer <access_token>"

# Create project
curl -X POST http://localhost:3000/tenants \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Company","slug":"my-company",...}'
```

## Webhooks

Webhooks are not currently implemented but are planned for future releases to notify external systems of events like user registration, subscription changes, etc.

## Changelog

### Version 1.0.0
- Initial release
- Authentication and authorization
- Multi-tenant architecture
- User and role management
- Notification system
- Billing and subscriptions
- AI and search capabilities
