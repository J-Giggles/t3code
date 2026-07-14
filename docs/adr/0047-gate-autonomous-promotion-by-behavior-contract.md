# Gate autonomous promotion by behavior contract

Status: accepted

Autonomous Extension Promotion eligibility is determined by the accepted extension behavior contract rather than semantic-version labels alone. A Contract-Preserving Update may promote autonomously only after the complete artifact, compatibility, migration, activation, stack, staging, and live checks pass. The release evidence must prove that accepted feature behavior, permission scope, durable-data guarantees, and supported surfaces are unchanged.

A Material Extension Change—including added, removed, or altered accepted behavior, expanded authority, an irreversible or destructive migration, or loss of a supported surface—requires a newly published and explicitly accepted hosted plan before it can enter the promotion pipeline. Passing tests or using a patch/minor version cannot bypass that decision boundary.

## Considered Options

- Trust semantic versioning to indicate safe updates: familiar, but publisher-selected version labels do not prove behavior or authority stability.
- Require approval for every rebuilt artifact: strongest manual control, but prevents routine contract-preserving repairs from being ready unattended.
- Diff the accepted behavior contract and require approval only for material changes: adds structured release evidence, but aligns autonomy with actual operator impact.
