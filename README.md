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
