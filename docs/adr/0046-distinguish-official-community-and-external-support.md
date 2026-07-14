# Distinguish official, community, and external support

Status: accepted

Every public extension declares one Extension Support Tier. `official` extensions are maintained by the T3 extension project and may be selected by default public presets. `community-verified` extensions remain the responsibility of their independent maintainers but are reviewed, rebuilt, attested, and compatibility-certified by the official catalog. `external` extensions are obtained only from an adopter-authorized Trusted Extension Catalog and carry that catalog's provenance, certification, and support claims rather than the official catalog's.

Support tier is independent of compatibility state, permissions, visibility, and installation state. Official verification of a community extension proves the reviewed artifact and declared behavior at a certified revision; it does not promise that the T3 extension project will maintain, repair, or indefinitely publish it.

## Considered Options

- Treat every official-catalog entry as project-maintained: simple presentation, but creates a false and unsustainable support promise.
- Put every third-party extension in external catalogs: clear ownership, but prevents the official catalog from curating high-quality community work.
- Separate official, community-verified, and external tiers: adds visible metadata, but makes maintenance and provenance promises precise.
