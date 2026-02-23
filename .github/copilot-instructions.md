# Copilot Instructions — VitePress-Template

## Project Overview

Generic **VitePress** documentation/portfolio template designed to deploy behind Traefik with automatic HTTPS. Completely domain-agnostic—all site-specific configuration happens at deployment time.

**Key principle**: Template contains no hardcoded domains or secrets. Clone, customize content, deploy anywhere.

## Tech Stack

- **Framework**: VitePress (latest)
- **Languages**: Markdown, TypeScript
- **Package manager**: Yarn
- **Build target**: Static site served via Nginx (Docker)
- **Deployment**: Docker multi-stage build → GHCR → Traefik host

## Local Development

```bash
yarn install
yarn docs:dev     # Dev server at http://localhost:5175
yarn docs:build   # Static build to docs/.vitepress/dist
yarn docs:preview # Preview production build
```

## Project Structure

```
docs/
  .vitepress/
    config.ts        # VitePress configuration
  index.md           # Homepage
  Resume/            # Example subdirectory
    index.md
  public/
    robots.txt
scripts/
  bootstrap_site_on_host.sh  # Clone repo to /opt/sites/<name>
  deploy_to_host.sh          # Generate compose + deploy to Traefik
  update_site.sh             # Pull latest image + restart
  cleanup.sh                 # Remove site from host
docker/
  docker-compose.yml  # Template for Traefik deployment
.github/
  workflows/
    build-and-push.yml  # CI/CD to GHCR
```

## Customizing for New Sites

1. **Content**: Edit Markdown files in `docs/`
2. **Navigation**: Update `.vitepress/config.ts` sidebar/nav
3. **Branding**: Change site title, description in config
4. **Repository name**: Fork/clone with new name
5. **GHCR image**: Update `.github/workflows/build-and-push.yml` with new image name

## Docker Build Pattern

Multi-stage Dockerfile:
```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
RUN yarn docs:build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=builder /app/docs/.vitepress/dist /usr/share/nginx/html
EXPOSE 80
```

Site container listens on port 80 internally—Traefik routes external 443 → container 80.

## GitHub Actions Workflow

Required workflow in `.github/workflows/build-and-push.yml`:

```yaml
name: Build and Push Docker Image
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/site-name:latest
```

**Critical**: After first push, set GHCR package to **Public** in GitHub → Packages for unauthenticated pulls.

## Deployment to Traefik Host

**Prerequisites**:
- Traefik already running on host (via Traefik-Deployment repo)
- Docker image pushed to GHCR
- DNS A/AAAA records pointing to host

**Bootstrap** (once):
```bash
sudo SITE_REPO="https://github.com/user/vitepress-site.git" \
     SITE_DIR="/opt/mysite" \
     /opt/traefik/scripts/bootstrap_site_on_host.sh
```

**Deploy** (first time):
```bash
sudo SITE_NAME="mysite" \
     SITE_HOSTS="example.com www.example.com" \
     SITE_IMAGE="ghcr.io/user/site:latest" \
     /opt/sites/mysite/scripts/deploy_to_host.sh
```

**Update** (automated via webhook or manual):
```bash
sudo -u deploy /opt/traefik/scripts/update_site.sh mysite
```

## Environment Variables (deployment)

Passed at deployment time, never hardcoded:

```bash
SITE_NAME=          # Short identifier (e.g., "docs")
SITE_HOSTS=         # Space-separated domains (e.g., "example.com www.example.com")
SITE_IMAGE=         # GHCR image:tag (e.g., "ghcr.io/user/site:latest")
TRAEFIK_DIR=        # Path to Traefik scripts (default: /opt/traefik)
TARGET_DIR=         # Sites directory (default: /opt/sites)
NETWORK_NAME=       # Docker network (default: traefik_proxy)
```

## Automated Deployment Flow

1. Push to `main` → GitHub Actions builds image → Pushes to GHCR
2. GitHub sends `workflow_run` event → Webhook listener validates
3. Webhook calls `/opt/traefik/scripts/update_site.sh`
4. Script pulls new image → Recreates container with `docker compose up -d`

**Webhook endpoint**: `https://hooks.<domain>/hooks/deploy-<SITE_NAME>`  
**Event type**: `workflow_run` ONLY (not `push` or `release`)  
**Validation**: HMAC-SHA256 signature matching `$WH_SECRET` in `~deploy/traefik.env`

## Scripts Overview

### bootstrap_site_on_host.sh
- Clones site repo to `/opt/sites/<SITE_DIR>`
- Sets ownership to `deploy` user
- Makes scripts executable
- **Does NOT deploy container**—just preps filesystem

### deploy_to_host.sh
- Generates Traefik-aware `docker-compose.yml` with dynamic labels
- Connects container to `traefik_proxy` network
- Starts container with `docker compose up -d`
- **Run as sudo-capable user**

### update_site.sh
- Pulls latest image from GHCR
- Recreates container (zero-downtime)
- Called by webhook automation

### cleanup.sh
- Stops and removes container
- Deletes site directory
- **Nuclear option**—use with caution

## VitePress Configuration Patterns

### Sidebar-only navigation
```ts
export default {
  themeConfig: {
    sidebar: [
      { text: 'Home', link: '/' },
      { text: 'Resume', link: '/Resume/' }
    ],
    // No top nav—clean, documentation-focused
  }
}
```

### SEO basics
```ts
export default {
  title: 'Site Title',
  description: 'Site description for SEO',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ]
}
```

## AI Agent Guidelines

- **Never hardcode domains**: All hostnames come from `SITE_HOSTS` env var at deployment
- **Keep template generic**: No site-specific branding or content in template repo
- **Multi-stage Docker builds**: Preserve builder + nginx pattern for minimal image size
- **Script compatibility**: Follow Bash patterns from Traefik-Deployment (env sourcing, validation)
- **Deployment sequence**: Bootstrap → Deploy → Update (never skip bootstrap)
- **Test locally first**: `yarn docs:dev` before committing content changes
- **GHCR visibility**: Remind users to set packages to Public after first push

## Common Pitfalls

1. **Hardcoded domains**: Site must work for ANY domain passed via `SITE_HOSTS`
2. **Missing docker group**: User must be in `docker` group or use sudo
3. **Wrong base path**: VitePress base must be `/` for root domain deployment
4. **Package private**: GHCR packages default to private—manual Public setting required
5. **Bootstrap skipped**: Must run `bootstrap_site_on_host.sh` before `deploy_to_host.sh`
6. **Event type mismatch**: Webhooks require `workflow_run`, not `push`

## Repository Naming Convention

Original repo was `joshphillipssr.com`—now renamed `VitePress-Template` to emphasize generic template nature. When forking:

- Choose descriptive repo name (e.g., `company-docs`, `portfolio-site`)
- Update GHCR image name in workflow to match
- Update `name` field in `package.json` (optional, cosmetic)
