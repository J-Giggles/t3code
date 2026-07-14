# Autonomously promote fully verified extension locks

Status: accepted

Nightly automation may autonomously promote an extension-stack candidate through Nightly and Staging to Main when every required compatibility, package, migration, permission, activation, topic-parity, and product acceptance gate passes for one exact Extension Installation Lock. The promotion transaction backs up each durable lane, carries the same reviewed artifacts and lock without re-resolution, performs the required staging proof, updates Main, relaunches Main, and runs Live Main Acceptance against the real application and public tailnet route before reporting success. Human approval is not required merely because promotion reaches Main; failed or incomplete proof must fail closed and must not be described as a successful promotion.

Candidates involving an unresolved product, architecture, security, new-permission, destructive-migration, or operator-workflow decision remain in review and are not eligible for Autonomous Extension Promotion.

## Considered Options

- Require manual approval for every exact lock: maximizes direct oversight, but prevents a fully proven overnight candidate from being ready before the operator returns.
- Update Main immediately after package checks: fast, but does not prove integration, relaunch, public routing, or the live user journey.
- Promote only a fully verified exact lock and prove relaunched Main: supports unattended readiness while keeping ambiguity and unproven changes out of Main.
