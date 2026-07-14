# Build official artifacts from reviewed source

Status: accepted

The official T3 Extension Catalog will list only source-available Extension Bundles whose release artifacts are built, tested, attested, and signed by a Catalog-Controlled Build from an immutable reviewed source revision. The resulting Catalog Build Provenance must bind the source revision, workflow identity, checks, artifact digest, and publishing identity. An extension maintainer may propose source and a release tag, but cannot upload or substitute a manually built binary for official distribution. Trusted third-party catalogs remain responsible for their own signing identities, build policies, and trust claims, which must not be presented as official-catalog provenance.

## Considered Options

- Trust publisher-uploaded binaries after checksum verification: verifies transfer integrity, but not what source or process produced the binary.
- Let each maintainer run an approved workflow in their own repository: improves transparency, but leaves official releases dependent on publisher-controlled workflow and credential changes.
- Rebuild and sign accepted source in a catalog-controlled workflow: adds catalog infrastructure and review load, but gives official artifacts a consistent, auditable supply chain and prevents binary substitution.
