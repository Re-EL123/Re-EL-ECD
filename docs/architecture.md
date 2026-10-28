# Architecture

Re-EL ECD is a multi-tenant SaaS platform for Early Childhood Development centres.

## Tech Stack
- Frontend: HTML5, CSS3, JavaScript, Alpine.js, GSAP
- Backend: Vercel Serverless Functions
- Database: Neon PostgreSQL
- Hosting: GitHub Pages + Vercel

## Multi-tenancy
All data is scoped by organisation_id. Permissions are enforced server-side.

## Security
- RBAC with resource-level permissions
- Tenant isolation
- Audit logging
- Secure sessions
