# Simple Password Authentication Plan

## Overview
Implement a simple password-based authentication system with a single password stored in environment variables. No user management, database storage, or password hashing required.

## Current Setup Analysis
- Express.js server running on port 3000
- PostgreSQL database already configured 
- Static file serving from `../public` 
- No existing authentication system
- Current app is a workflow engine for insurance reports

## Authentication Requirements
- Single password stored in `.env` file
- Session-based authentication (no persistent storage)
- Simple login page served when not authenticated
- Redirect to `index.html` after successful authentication

## Implementation Plan

### 1. Environment Variable
- Add `AUTH_PASSWORD=your_password_here` to `.env` file

### 2. Server-Side Changes

#### Dependencies to Add
- `express-session` (for session management)

#### New Files
- **Auth middleware** (`server/middleware/auth.js`)
  - Check if session exists and is valid
  - Redirect to login page if not authenticated
- **Auth routes** (`server/routes/auth.js`) 
  - `POST /auth/login` - validate password and set session
  - `POST /auth/logout` - destroy session

#### Modifications
- **server.js**
  - Add express-session configuration
  - Add auth middleware to protect routes
  - Modify static file serving to check authentication
  - Serve login page for unauthenticated users

### 3. Client-Side Components

#### New Files
- **Login page** (`public/login.html`)
  - Simple form with password input
  - Submit button to authenticate
- **Login styles** (`public/css/login.css`)
  - Styling for login form
- **Login JavaScript** (`public/js/login.js`)
  - Form submission handling
  - Error message display
  - Redirect after successful authentication

### 4. Authentication Flow

1. **User visits any route**
2. **Server checks authentication**
   - If session exists and valid → serve requested page
   - If not authenticated → serve `login.html`
3. **User enters password**
4. **Password validation**
   - Compare against `process.env.AUTH_PASSWORD`
   - If valid → set session → redirect to `index.html`
   - If invalid → show error message
5. **Subsequent requests**
   - Session middleware validates existing session
   - User remains authenticated until session expires or logout

### 5. Security Features
- Session-based authentication with secure cookies
- Session expiration (configurable timeout)
- Input validation on password submission
- No password storage in client-side code

### 6. Integration Points
- Protect existing routes with auth middleware
- Add logout functionality to existing UI header
- Session persistence during server development restarts
- Graceful handling of expired sessions

## File Structure
```
server/
├── middleware/
│   └── auth.js              # Authentication middleware
├── routes/
│   └── auth.js              # Authentication routes
└── server.js                # Modified with session config

public/
├── login.html               # Login page
├── css/
│   └── login.css           # Login page styles
└── js/
    └── login.js            # Login page JavaScript

.env                         # Add AUTH_PASSWORD variable
```

## Configuration
- Session timeout: 24 hours (configurable)
- Session secret: Generate secure random string for production
- Cookie settings: httpOnly, secure (in production), sameSite