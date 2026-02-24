# VitePress Template

Reusable VitePress template designed for deployment behind Traefik.

This repository is intended to be used with **GitHub "Use this template"** to create a derived site repository, then deployed on a host where Traefik is already managed by [Traefik-Deployment](https://github.com/joshphillipssr/Traefik-Deployment).

For copy/paste operator steps, see [Quick-Start.md](Quick-Start.md).

## What This Template Includes

- VitePress docs scaffold (`docs/`)
- Multi-stage Docker build (`Dockerfile`)
- GHCR build/push workflow (`.github/workflows/build-and-push.yml`)
- Host deployment scripts (`scripts/`)
- Deployment config contract (`site.env.example`)

## Deployment Model

Expected host layout:

```text
/opt/traefik/        # Traefik-Deployment repository and scripts
/opt/sites/<name>/   # Derived site repository + generated compose
```

Expected shared network:

```text
traefik_proxy
```

## Configuration Contract

Copy `site.env.example` to `site.env` in the derived site repository and fill values.

Required variables:

```text
SITE_NAME
SITE_HOSTS
SITE_IMAGE
```

Common optional variables:

```text
SITE_PORT=80
TARGET_DIR=/opt/sites
NETWORK_NAME=traefik_proxy
ENTRYPOINTS=websecure
CERT_RESOLVER=cf
MIDDLEWARES=
DEPLOY_NOW=true
FORCE=false
```

`site.env` is gitignored by default.

## Optional: Expiring Private Resume Links

This template supports signed, expiring links for a private markdown resume route.

Key variables in `site.env`:

```text
SITE_BASE_URL=https://example.com
RESUME_SIGNING_SECRET=<random-secret>
RESUME_ROUTE=/_private/resume
RESUME_LINK_TTL_SECONDS=900
RESUME_PRIVATE_FILE=/run/private/resume.md
RESUME_PRIVATE_FILE_HOST=/opt/secure/private-resume.md
```

Generate a link:

```bash
ENV_FILE=/opt/sites/<site-name>/site.env \
  /opt/sites/<site-name>/scripts/generate_private_resume_link.sh
```

If `RESUME_PRIVATE_FILE_HOST` is set, `deploy_to_host.sh` mounts that file read-only into the container.

## Optional: Ask JoshGPT

Ask JoshGPT provides AI Q&A grounded in local site docs plus public GitHub repo metadata.

Required variable:

```text
OPENAI_API_KEY=<secret>
```

Optional variables:

Legacy `ASK_ASSISTANT_*` names are also accepted for compatibility.

```text
ASK_JOSHGPT_MODEL=gpt-4o-mini
ASK_JOSHGPT_MAX_TOKENS=700
ASK_JOSHGPT_TEMPERATURE=0.2
ASK_JOSHGPT_TIMEOUT_MS=30000
ASK_JOSHGPT_RATE_LIMIT_WINDOW_SECONDS=300
ASK_JOSHGPT_RATE_LIMIT_MAX=10
ASK_JOSHGPT_MAX_QUESTION_CHARS=1200
```

Routes:

```text
/ask-joshgpt/        # Ask JoshGPT UI page
/api/ask-joshgpt     # backend API endpoint
```

## Script Responsibilities

- `scripts/bootstrap_site_on_host.sh`
  - Clones or updates a derived repository on the host.
  - Supports `SITE_REPO`, `SITE_NAME`, `SITE_DIR`, `SITE_REF`, `DEPLOY_USER`.
  - Creates `site.env` from `site.env.example` when missing.

- `scripts/deploy_to_host.sh`
  - Loads config from `site.env` (or `ENV_FILE`).
  - Validates required variables.
  - Generates `/opt/sites/<SITE_NAME>/docker-compose.yml`.
  - Applies Traefik host-based labels and deploys with Docker Compose.

- `scripts/update_site.sh`
  - Pulls latest image and recreates the site container.

- `scripts/generate_private_resume_link.sh`
  - Generates signed URLs with expiry for `RESUME_ROUTE`.

- `scripts/cleanup.sh`
  - Stops/removes the site stack and deletes generated site directory.

## Generated Traefik Labels

`deploy_to_host.sh` writes labels in this pattern:

```text
traefik.enable=true
traefik.http.routers.<SITE_NAME>.entrypoints=websecure
traefik.http.routers.<SITE_NAME>.tls=true
traefik.http.routers.<SITE_NAME>.tls.certresolver=cf
traefik.http.routers.<SITE_NAME>.rule=Host(`<host1>`) || Host(`<host2>`)
traefik.http.services.<SITE_NAME>.loadbalancer.server.port=<SITE_PORT>
```

## Maintenance Guidance

- Template update strategy for derived repos: [MAINTENANCE.md](MAINTENANCE.md)
- Operator runbook checklist: [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)
