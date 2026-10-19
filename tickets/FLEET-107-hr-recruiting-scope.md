# FLEET-107 — HR and recruiter product scope

Status: Done

## Problem

The workforce platform already supported secure attendance, assignments, work evidence, review, and reporting, but several labels and examples sounded like shipment or dispatch operations. That created ambiguity about whether the product was intended to manage drivers.

## Product decision

Position FleetOps Workforce explicitly as the internal HR and recruiter system for a trucking and logistics company. Preserve the generic employee data model because HR staff and recruiters are employees, while removing driver-management implications from user-facing content and safe default data.

## Acceptance criteria

- Login, dashboard, directory, reports, task creation, and setup copy identify HR and recruiting workflows.
- The product states that it does not manage drivers, vehicles, dispatch, routes, or fleet maintenance.
- Task examples use recruiting and HR evidence rather than freight documentation.
- Fresh databases seed Human Resources, Recruiting, and HR Compliance departments.
- Existing databases add the HR departments and remove obsolete Operations/Dispatch defaults only when they are unreferenced.
- Authorization, attendance, tasks, uploads, reviews, and reports remain functionally unchanged.
