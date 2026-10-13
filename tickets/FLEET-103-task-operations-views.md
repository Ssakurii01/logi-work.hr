# FLEET-103 — Task operations views and workload context

**Status:** Done  
**Priority:** P1  
**Area:** Tasks / Manager dashboard

## Research

- [ClickUp Tasks](https://clickup.com/features/tasks) supports list, board, calendar, timeline, and Gantt views over the same task data.
- [Asana features](https://asana.com/features) includes workload and capacity planning so managers can rebalance work instead of reading assignments one row at a time.

## Product decision

Keep the dense, sortable table for operational detail and add a board for flow. For managers, add a compact workload strip based on active assignment counts. FleetOps avoids presenting the count as a productivity score; it is labeled as planning context only.

## Acceptance criteria

- Users can switch between list and board without losing active filters.
- The board groups assignments into To do, In progress, Review, and Completed.
- Task cards show priority, deadline, progress, and assignee where permitted.
- Managers see active workload per employee and can open a task from either view.
- Mobile layouts remain usable without horizontal page overflow.

## Implementation

- UI-only enhancement in `components/workforce/workforce-app.tsx` and `app/globals.css`.
