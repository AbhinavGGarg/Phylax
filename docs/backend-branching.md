# Backend branching — safe RLS / trigger / function changes

Phylax's security depends on RLS policies, state-machine triggers, and the
append-only guards in migrations `0002`–`0004`. Changing them directly on the
production control plane is risky. Use an InsForge **schema-only security branch**
to test the change end-to-end first.

> A backend branch shares `JWT_SECRET` (existing user JWTs keep working) but gets
> a fresh database + EC2 + `API_KEY` / `ANON_KEY`. A **schema-only** branch copies
> the schema, **not** operational user data — do not treat a branch as a way to
> merge production rows.

## Workflow

```bash
cd phylax

# 1. create a schema-only branch and switch to it
npx @insforge/cli branch create sec-rls-review --mode schema-only

# 2. point the tooling at the branch backend, then apply the risky change there
#    (branch create prints the branch's base URL + keys — update .env.local, restart the host)
npx @insforge/cli db migrations up --all
npm run deploy:functions
npm run seed:users
npm run test:node                    # RLS isolation + guards must pass on the branch

# 3. review the exact SQL a merge would apply to production
npx @insforge/cli branch merge sec-rls-review --dry-run --save-sql ./docs/merge-preview.sql

# 4. merge to the parent once green
npx @insforge/cli branch merge sec-rls-review

# 5. clean up
npx @insforge/cli branch delete sec-rls-review
```

## Rules

- **Always** `--dry-run` a merge and read the SQL before applying it.
- Branching only merges **schema** (DDL/policies/functions/triggers), never business rows.
- After `branch create` / `branch switch`, update the app's InsForge URL + anon key and restart the host so the SDK talks to the selected backend.
- If the backend version doesn't support branching, report that limitation instead of working around it.
