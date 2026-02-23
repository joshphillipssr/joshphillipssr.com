# Deployment Checklist

Operator checklist for deploying a template-derived VitePress site behind Traefik.

## Pre-Deploy

- [ ] Traefik host is healthy (`docker ps` shows Traefik running).
- [ ] Cloudflare prerequisites completed per [Traefik-Deployment Cloudflare Setup Baseline](https://github.com/joshphillipssr/Traefik-Deployment/blob/main/CLOUDFLARE-SETUP.md).
- [ ] Derived repo exists and workflow has produced a GHCR image.
- [ ] GHCR image tag and visibility are confirmed.

## Bootstrap

- [ ] Run `scripts/bootstrap_site_on_host.sh` with `SITE_REPO` and `SITE_NAME`.
- [ ] Confirm repository exists at `/opt/sites/<site-name>`.
- [ ] Confirm `site.env` exists (copied from `site.env.example` if new).

## Configure

- [ ] Set `SITE_NAME` in `site.env`.
- [ ] Set `SITE_HOSTS` in `site.env`.
- [ ] Set `SITE_IMAGE` in `site.env`.
- [ ] Verify `NETWORK_NAME=traefik_proxy` unless intentionally changed.
- [ ] Review optional vars (`SITE_PORT`, `MIDDLEWARES`, `DEPLOY_NOW`, `FORCE`).

## Deploy

- [ ] Run `ENV_FILE=/opt/sites/<site-name>/site.env /opt/sites/<site-name>/scripts/deploy_to_host.sh`.
- [ ] Confirm compose file generated at `/opt/sites/<site-name>/docker-compose.yml`.
- [ ] Confirm container is running with `docker ps`.

## Verify

- [ ] `curl -I https://<primary-hostname>` returns expected HTTP status.
- [ ] Browser test confirms certificate and content are correct.
- [ ] Traefik logs show successful routing to site container.

## Rollback

Use one of these rollback methods:

1. Repoint `SITE_IMAGE` to last known-good tag in `site.env` and re-run deploy.
2. Run `SITE_NAME=<site-name> /opt/sites/<site-name>/scripts/update_site.sh` after restoring previous tag.
3. As last resort, run `SITE_NAME=<site-name> /opt/sites/<site-name>/scripts/cleanup.sh` and redeploy known-good config.

## Troubleshooting

- Network error:
  - Confirm `traefik_proxy` exists.
  - Run `NETWORK_NAME=traefik_proxy /opt/traefik/scripts/create_network.sh`.
- GHCR pull error:
  - Validate package visibility/permissions and `SITE_IMAGE` spelling.
- TLS/certificate issues:
  - Re-check [Traefik-Deployment Cloudflare Setup Baseline](https://github.com/joshphillipssr/Traefik-Deployment/blob/main/CLOUDFLARE-SETUP.md) and Traefik resolver configuration.
- Container starts but route fails:
  - Check `SITE_PORT` matches the app container listening port.
