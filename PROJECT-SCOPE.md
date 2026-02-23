# VitePress-Template Project Scope

## Objective

Provide a reusable VitePress template that can be turned into derived repositories and deployed behind Traefik with a repeatable operator workflow.

## Scope

In scope:

- Template content and VitePress scaffold
- Docker image build pipeline to GHCR
- Host scripts to bootstrap, deploy, update, and remove a derived site
- Configuration contract via `site.env.example`
- Documentation for first deploy, maintenance, and operations checklist

Out of scope:

- Provisioning Traefik itself (handled by Traefik-Deployment)
- Managing DNS providers other than the [Traefik-Deployment Cloudflare Setup Baseline](https://github.com/joshphillipssr/Traefik-Deployment/blob/main/CLOUDFLARE-SETUP.md)
- One-click platform-specific automation beyond provided shell scripts

## Integration Boundary

This repository assumes a host prepared by [Traefik-Deployment](https://github.com/joshphillipssr/Traefik-Deployment), including:

- `/opt/traefik` scripts available
- `/opt/sites` directory model
- Shared Docker network `traefik_proxy`
- Docker access for deployment operator account (typically `deploy`)

## Canonical Workflow

1. Create a repository from this template.
2. Push to `main` so GitHub Actions publishes `ghcr.io/<owner>/<repo>:latest`.
3. Bootstrap the derived repo on host with `scripts/bootstrap_site_on_host.sh`.
4. Create/edit `/opt/sites/<site-name>/site.env`.
5. Deploy with `scripts/deploy_to_host.sh`.
6. Verify HTTPS route.
7. Update via `scripts/update_site.sh` (or Traefik helper).

## Configuration Contract

Required deploy variables:

- `SITE_NAME`
- `SITE_HOSTS`
- `SITE_IMAGE`

Optional deploy variables:

- `SITE_PORT` (default `80`)
- `TARGET_DIR` (default `/opt/sites`)
- `NETWORK_NAME` (default `traefik_proxy`)
- `ENTRYPOINTS` (default `websecure`)
- `CERT_RESOLVER` (default `cf`)
- `MIDDLEWARES` (optional)
- `DEPLOY_NOW` (default `true`)
- `FORCE` (default `false`)

## Deliverables

- `README.md` for architecture and script roles
- `Quick-Start.md` for canonical operator steps
- `MAINTENANCE.md` for template-to-derived-repo update strategy
- `DEPLOYMENT-CHECKLIST.md` for deployment and rollback checks
