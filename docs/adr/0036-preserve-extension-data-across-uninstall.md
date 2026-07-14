# Preserve extension data across uninstall

Status: accepted

Every stateful Extension Bundle will use a host-governed Extension Data Namespace and implement a predictable lifecycle: disable stops registration while retaining code and data; uninstall removes code and registration while preserving data by default; Extension Purge is a separate explicit destructive action. Upgrades run Extension Data Migrations transactionally, rollback restores the prior artifact and data snapshot, downgrade is refused without a tested reverse migration, and reinstall must reconcile retained data through a compatible migration path. Extensions cannot mutate core T3 Code storage outside an explicit host-owned migration contract.

## Considered Options

- Delete data on uninstall: simple cleanup, but makes experimentation and rollback destructive.
- Let every extension invent lifecycle behavior: flexible, but prevents the installer from promising recovery or safe reinstallation.
- Host-governed lifecycle with preserved data and explicit purge: requires migration contracts and snapshots, but makes extension changes predictable and recoverable.
