# Test Notes

Validation notes for template hardening changes.

## Local Validation

- `bash -n scripts/bootstrap_site_on_host.sh`
- `bash -n scripts/deploy_to_host.sh`
- `bash -n scripts/update_site.sh`
- `bash -n scripts/cleanup.sh`
- `yarn docs:build`

## Deploy Script Smoke Test

- Created temporary `site.env` with:
  - `SITE_NAME=smoke-site`
  - `SITE_HOSTS="smoke.example.com www.smoke.example.com"`
  - `SITE_IMAGE=nginxdemos/hello:plain-text`
  - `DEPLOY_NOW=false`
- Ran:
  - `ENV_FILE=<tmp>/site.env scripts/deploy_to_host.sh`
- Verified:
  - Compose file generated at `<tmp>/smoke-site/docker-compose.yml`
  - Generated labels include host-based rule and `traefik_proxy` network
  - Manual deploy instructions printed correctly

## Config Contract Validation

- Confirmed `site.env.example` matches variables consumed by `deploy_to_host.sh`.
- Confirmed `site.env` is gitignored.

## Documentation Validation

- Confirmed `README.md`, `Quick-Start.md`, and `PROJECT-SCOPE.md` all use same script names and flow.

## Host Validation (Pending)

- End-to-end deployment test on target Traefik host (public HTTPS route verification) remains tracked in issue #8.
