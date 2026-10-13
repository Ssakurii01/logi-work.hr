# FLEET-101 — Server-verified breaks

**Status:** Done  
**Priority:** P0  
**Area:** Attendance

## Research

- [Deputy employee time clock](https://www.deputy.com/features/employee-time-clock) treats breaks as first-class shift events and gives managers a live view of working, on-break, and finished employees.
- [BambooHR Time Tracking](https://www.bamboohr.com/platform/time-and-attendance/time-tracking) places meal/rest break actions in the same employee time flow and exposes break timing and duration to managers.

## Product decision

Add an explicit Start break / End break state to the employee shift. The database, not the browser, records timestamps. Net working time subtracts completed breaks. FleetOps improves the common pattern by keeping the same correction-request boundary: employees cannot rewrite break or attendance timestamps directly.

## Acceptance criteria

- An employee can start a break only during an active shift and can have only one active break.
- An employee must end an active break before clocking out.
- All break timestamps use `statement_timestamp()` in PostgreSQL.
- Daily duration excludes completed break minutes.
- Employees see only their own breaks; admins can see all breaks.
- Break start/end actions are written to the audit log.

## Implementation

- Migration: `supabase/migrations/202610130002_benchmark_improvements.sql`
- UI: attendance hero, dashboard quick action, and attendance history break totals.
