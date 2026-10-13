# FLEET-106 — Functional setup controls

Status: Done

## Problem

The unconfigured production Site displayed environment-variable names as code chips. They looked interactive, but were plain text. Because Supabase was not connected, the application correctly withheld every authenticated portal control; however, the screen did not make that dependency or the next action clear enough.

## Product decision

Keep the secure fail-closed behavior and improve the activation experience instead of rendering a non-functional demo portal. The setup screen now:

- clearly says that portal controls are locked until Supabase is connected;
- turns each environment-variable chip into a working copy button with feedback;
- adds a working activation-guide toggle;
- adds a one-click activation-checklist copy action;
- explains which migration, environment, first-admin, and verification steps remain.

## Acceptance criteria

- Every element styled as a button is a semantic `button` with a working action.
- Copy actions provide success or blocked-clipboard feedback.
- The guide control reports its expanded state to assistive technology.
- No dashboard, attendance, task, or employee data is exposed before the database and authentication layer are configured.
- The layout remains usable on desktop and mobile.

## Verification

- TypeScript, lint, and production build pass.
- Local browser smoke test opens and closes the activation guide.
- Production smoke test repeats the interaction after deployment.
