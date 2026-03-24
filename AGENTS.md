# AGENTS Instructions: joshphillipssr.com

Scope:
- Applies only to this repository.
- Use this file as the primary repo-level instruction set for work in `joshphillipssr.com`.

## Repository Purpose

- Public-facing VitePress site for Josh Phillips Sr.
- Includes a public resume, project pages, branding assets, and an optional signed private resume route.
- Functions as an overlay on top of the reusable VitePress template; keep template-derived behavior stable unless a change is clearly needed here.

## Resume Workflow

- Public resume source: `docs/resume/index.md`
- Private resume content must not be added under `docs/` or other tracked public content paths.
- Use `private/resume.md` for local-only private resume drafting in this workspace.
- Keep `private/` gitignored and treat it as authoring input for `RESUME_PRIVATE_FILE_HOST`, not as tracked repository content.
- Public resume content must stay sanitized for public exposure.
- Private resume drafts may be more tailored, but still must avoid secrets, internal IDs, or FOUO-only operational detail that does not belong in an applicant-facing document.

## Editing Boundaries

- Expected overlay/content files:
  - `docs/index.md`
  - `docs/resume/index.md`
  - `docs/projects/`
  - `docs/public/images/branding/`
- Treat these as the normal local customization surface for this repo.
- Treat `server/`, `scripts/`, `Dockerfile`, `site.env.example`, and deployment-oriented sections of `README.md` / `Quick-Start.md` as template-derived. Change them only when the repo truly needs behavior different from the template.

## Dependencies and Validation

- This repo is validated from the Linux-based `codex-control` environment, not from local macOS.
- If `node_modules` was installed on another OS or architecture, replace it with a fresh Linux install before validating.
- Do not reuse or copy `node_modules` between macOS and Linux environments.
- Default validation flow:
  - `npm install --no-package-lock`
  - `npm run docs:build`
- Ignore generated VitePress temp output in `docs/.vitepress/.temp`.

## Git and Deployment

- Before GitHub mutations, confirm `gh auth status`.
- Build locally before commit/push when public site content changes.
- Live host: `neo.cfhidta.net`.
- Use the existing host checkout and deployment scripts instead of ad-hoc file copies when updating the live site.
- Confirm the live site directory and `site.env` on host before changing deployment behavior or private resume mount paths.

## Content Safety

- Keep public site content safe for broad internet exposure.
- Do not copy sensitive internal documentation details from HIDTA repositories directly into tracked public site content.
- Prefer concise, executive-facing language for resume work; tools and implementation detail should support the story, not dominate it.
