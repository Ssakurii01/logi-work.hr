# FLEET-102 — Reusable task playbooks and checklists

**Status:** Done  
**Priority:** P1  
**Area:** Tasks

## Research

- [Asana templates](https://asana.com/features/workflow-automation/project-task-templates) let teams standardize repeatable work with tasks, dates, dependencies, rules, and fields.
- [ClickUp Tasks](https://clickup.com/features/tasks) combines checklists, multiple assignees, recurring work, dependencies, comments, and multiple views.

## Product decision

Introduce manager-owned task playbooks containing title, instructions, acceptance criteria, priority, default lead time, and a checklist. A playbook can prefill a new task without creating hidden automation. Each assignee gets an independent checklist state, and checklist completion updates visible progress.

## Acceptance criteria

- Managers can apply a saved playbook while creating a task.
- Managers can save a new task as a reusable playbook.
- Checklist items are copied into every assignment independently.
- Only the assigned employee can toggle their checklist while the task is editable.
- Submitted/completed assignments lock checklist edits.
- Checklist writes are enforced by a security-definer function and recorded in audit logs.

## Implementation

- Migration: task templates, task checklist items, assignment checklist state, RLS, trigger, and `set_checklist_item` RPC.
- UI: playbook picker, newline checklist editor, task-detail checklist, and progress synchronization.
