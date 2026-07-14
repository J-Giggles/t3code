# Require version-bound extension visuals

Status: accepted

Every catalog extension will satisfy an Extension Visual Contract. Each bundle includes an architecture/package diagram and install/capability/lifecycle flow; UI extensions add screenshots produced by headed tests at the exact Extension Bundle Version, while non-UI extensions add an appropriate sequence, state, or data-flow diagram, with before/after views when an existing T3 surface materially changes. Every visual records Visual Evidence Provenance and must be accessible, responsive, and current. Tailnet acceptance plans embed the assets to remain self-contained, and visual drift is a failing documentation check rather than optional maintenance.

## Considered Options

- Add screenshots opportunistically: quick, but produces stale untraceable pictures that cannot support acceptance.
- Require only diagrams: stable and compact, but fails to prove visible UI integration.
- Require provenance-bound diagrams plus headed screenshots where applicable: adds evidence work, but makes extension shape and product behavior reviewable without reading source.
