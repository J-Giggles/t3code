# Admit community extensions through independent review

Status: accepted

A community extension enters the official catalog only through a source pull request containing its bundle manifest, Extension Distribution License, requested permissions, compatibility declarations, acceptance tests, documentation, and Extension Visual Contract. Catalog-controlled automation rebuilds, attests, and certifies the proposed artifact, but automation alone cannot grant initial inclusion. An Extension Admission Review must be approved by a catalog maintainer other than the submitter.

Any extension requesting shell execution, network access, credential access, native code, or broad filesystem authority also requires a Privileged Extension Review that records the threat boundary and least-authority rationale. Later Contract-Preserving Updates may publish automatically after complete catalog checks; a Material Extension Change returns to the applicable admission and security review.

## Considered Options

- Allow maintainers to publish directly after automated checks: fast, but permits self-approval and makes catalog trust equivalent to publisher trust.
- Require manual approval for every artifact rebuild: maximizes direct control, but creates unnecessary delay for proven contract-preserving maintenance.
- Manually admit reviewed source, add security review for privileged authority, and automate safe follow-ups: balances community contribution with durable catalog trust.
