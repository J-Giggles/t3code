# Keep published capability versions immutable

Status: accepted

A published Host Capability version is immutable. Additive compatible contract releases may extend its minor version only where old consumers preserve identical semantics; any breaking schema, authority, lifecycle, failure, or behavioral change creates a new major capability version. Extension Host Adapters may expose multiple major versions concurrently so upstream movement does not force a synchronized extension rewrite.

Capability Version Retirement is allowed only after no supported Extension Installation Lock depends on the version, migration guidance and replacement evidence exist, affected extensions have a certified path, and the removal has completed an accepted hosted Material Extension Change plan. An adapter cannot silently stop exposing a version still required by a supported lock.

## Considered Options

- Allow adapters to reinterpret capability versions for each upstream release: minimizes version count, but makes compatibility claims unstable and unauditable.
- Force every extension to upgrade with each Host change: simplifies adapters, but recreates lockstep coupling to upstream.
- Keep versions immutable, expose majors side by side, and retire deliberately: requires compatibility maintenance, but gives extensions a durable contract independent of repository churn.
