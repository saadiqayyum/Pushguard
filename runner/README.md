# Pushguard runner

Runs scanners and detonation away from the monitored repositories. Pushguard
creates a label `pg-<nonce>` in the runner repository; the workflow starts on
that label, exchanges the one-time nonce for the repository tarball and a
one-time report token, and reports back. No repository token, App key or model
key reaches the runner, and the label is deleted once the nonce is used.

## Setup

1. Create a private repository, for example `pushguard-runner`.
2. Copy `pushguard-runner.yml` to `.github/workflows/` in it. Do not add secrets.
3. Build `detonator-linux-amd64` with `make PLAYBOOK_PUBLIC_KEY=<base64 SPKI>`
   (the key staff rules and checks are signed with; without it, a rule's
   check never runs), upload it to a release in it, and set `DETONATOR_TAG` and
   `DETONATOR_SHA256` in the workflow.
4. Install the Pushguard App on it (Issues: write covers labels).
5. Settings > Actions > General: GitHub-hosted runners only, default workflow
   permissions read.
6. Set `RUNNER_REPO=owner/name` in the deployment.

Each org gets a monthly detonation quota on this runner.

