# FLEET-105 — Deployment readiness and secure configuration

**Status:** Done  
**Priority:** P0  
**Area:** Operations / Security

## Research

- [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys) distinguishes publishable browser keys from secret server keys and notes that secret keys bypass RLS.
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) require authorization/RLS for downloads and support time-limited signed URLs.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) documents bucket and folder policies enforced through PostgreSQL RLS.

## Product decision

Turn the unconfigured state into an actionable production-readiness screen. Update deployment documentation for Supabase's current publishable/secret key terminology while retaining compatibility with the legacy environment variable names used by this app.

## Acceptance criteria

- An unconfigured deployment shows an ordered setup path: database, environment, first admin, verification.
- The page never prints secret values or exposes server configuration.
- Documentation recommends a publishable key in the browser and a secret/server key only in the hosting secret store.
- The checklist includes role-isolation, private file, attendance, and approval-flow verification.

## Implementation

- Expanded setup UI and updated `README.md` production instructions.
