# Quick Start

Canonical first-time flow for deploying a template-derived VitePress site behind Traefik.

## Prerequisites

- Traefik host already provisioned with [Traefik-Deployment](https://github.com/joshphillipssr/Traefik-Deployment)
- `traefik_proxy` network exists on host
- Cloudflare prerequisites completed per [Traefik-Deployment Cloudflare Setup Baseline](https://github.com/joshphillipssr/Traefik-Deployment/blob/main/CLOUDFLARE-SETUP.md)
- GitHub repository created from this template

## 1. Create Derived Repository

1. In GitHub, select **Use this template**.
2. Create a new repository (example: `docs-site`).
3. Clone locally and customize content/config:

```bash
git clone https://github.com/<owner>/<repo>.git
cd <repo>
```

## 2. Push Once To Build Image

Push to `main` so the workflow publishes:

```text
ghcr.io/<owner>/<repo>:latest
```

The workflow resolves this tag automatically from repository name and owner.
If the host will pull anonymously, set the package visibility to **Public** in GHCR.

## 3. Bootstrap Repo On Host

Run on the host as a sudo-capable user:

```bash
sudo SITE_REPO="https://github.com/<owner>/<repo>.git" \
     SITE_NAME="<site-name>" \
     bash -c "$(curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/bootstrap_site_on_host.sh)"
```

Result:

- Repository cloned at `/opt/sites/<site-name>`
- Scripts marked executable
- `site.env` created from `site.env.example` if missing

## 4. Configure `site.env`

On host:

```bash
cd /opt/sites/<site-name>
nano site.env
```

Set required values:

```text
SITE_NAME=<site-name>
SITE_HOSTS="example.com www.example.com"
SITE_IMAGE=ghcr.io/<owner>/<repo>:latest
```

Common optional values:

```text
SITE_PORT=80
NETWORK_NAME=traefik_proxy
ENTRYPOINTS=websecure
CERT_RESOLVER=cf
DEPLOY_NOW=true
```

## 5. Deploy

Run from host as user with Docker access:

```bash
ENV_FILE=/opt/sites/<site-name>/site.env \
  /opt/sites/<site-name>/scripts/deploy_to_host.sh
```

This generates:

```text
/opt/sites/<site-name>/docker-compose.yml
```

And deploys the container (if `DEPLOY_NOW=true`).

## 6. Verify

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -I https://<primary-hostname>
```

Expected:

- Container is running
- HTTPS returns `200`/`301`/`302` depending on site config

## 7. Update

After a new image push:

```bash
SITE_NAME="<site-name>" /opt/sites/<site-name>/scripts/update_site.sh
```

Or with Traefik helper:

```bash
SITE_NAME="<site-name>" /opt/traefik/scripts/update_site.sh
```

## 8. Remove (Optional)

```bash
SITE_NAME="<site-name>" /opt/sites/<site-name>/scripts/cleanup.sh
```

## Troubleshooting

- `network not found`: run `NETWORK_NAME=traefik_proxy /opt/traefik/scripts/create_network.sh`
- GHCR pull fails: verify package visibility and `SITE_IMAGE` value
- TLS issues: verify Cloudflare proxy + DNS + SSL mode
- Permission issues: run deployment as `deploy` user (or equivalent Docker-enabled user)
