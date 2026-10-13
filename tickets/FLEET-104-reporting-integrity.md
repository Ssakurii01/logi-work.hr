# FLEET-104 — Reporting integrity and explainability

**Status:** Done  
**Priority:** P0  
**Area:** Reports

## Research

- [BambooHR HR Data & Reporting](https://www.bamboohr.com/platform/hr-data-and-reporting/) emphasizes live dashboards, configurable reports, role-based access, and context for workforce trends.
- [BambooHR custom dashboards](https://www.bamboohr.com/platform/hr-data-and-reporting/custom-dashboards-and-analytics) builds visualizations from the organization's live source data instead of manual consolidation.

## Product decision

Fix the report period boundary so every employee row and export uses only the selected period. Show counts and rates with their denominators, and preserve the existing human-review warning. Do not generate a composite performance score or disciplinary recommendation.

## Acceptance criteria

- Daily, weekly, and monthly selections filter attendance, assignments, completions, and reviews consistently.
- Report rows include assigned, completed, on-time, overdue, revisions, hours, late arrivals, and missed clock-outs.
- Completion and on-time rates show `—` when a denominator is zero.
- A methodology panel explains each denominator and the data window.
- CSV and Excel exports exactly match the visible period table.

## Implementation

- Corrected report scoping and added transparent derived metrics in the Reports view.
