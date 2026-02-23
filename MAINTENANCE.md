# Derived Repo Maintenance

This guide describes how repositories created from this template should consume upstream improvements over time.

## Recommended Strategy

Use **periodic manual sync** from template to derived repo.

Why:

- Most derived repos customize content and theme files heavily.
- Rebasing a long-lived content-heavy repo onto template history can create noisy conflicts.
- Manual sync keeps operational scripts/docs aligned without forcing content history rewrites.

## Suggested Cadence

- Review template updates monthly.
- Review immediately for security or deployment-script fixes.

## What To Sync First

Prioritize operational files:

1. `scripts/`
2. `.github/workflows/build-and-push.yml`
3. `Dockerfile`
4. `site.env.example`
5. `Quick-Start.md` and `README.md` sections relevant to deployment

## Sync Options

### Option A: Targeted Cherry-Pick (preferred when clean)

Use when template commits are focused and isolated.

Pros:

- Preserves upstream change intent
- Easier audit trail

Risks:

- Can still conflict when files diverge significantly

### Option B: Manual File Sync (preferred for heavily customized repos)

Copy needed changes file-by-file and commit with local context.

Pros:

- Predictable conflict handling
- Better for customization-heavy repos

Risks:

- Easier to miss subtle upstream fixes if review is incomplete

## Change Review Checklist

- Validate script variable names still match `site.env`.
- Confirm deploy labels still match Traefik expectations.
- Confirm workflow still publishes expected GHCR image tag.
- Re-run shell syntax checks for changed scripts.

## Risk Notes For Customization-Heavy Repos

- Avoid editing deployment scripts unless necessary; keep content/theme changes separate from infra changes.
- Keep `site.env` host-specific and uncommitted.
- If custom middleware/labels are added, document them near `site.env` to reduce operator error.
