## Prerequisites

- Docker with compose v2
- Pods provisioned and running: `t3-convex-docker.sh up <slug>`
- For T1 deploy: `t3-convex-docker.sh keys <slug>`

## Suites

| Suite | Tests |
|-------|-------|
| `quick` | T0, T1, T2 |
| `remote` | T3 |
| `full` | T0–T9 |
| `completion` | All (T4.3 manual unless `--skip-manual`) |

## Run

```bash
./.agents/scripts/t3-convex-docker-verify.sh --suite quick
./.agents/scripts/t3-convex-docker-verify.sh --suite full --skip-manual --report /tmp/pod-completion.json
```
