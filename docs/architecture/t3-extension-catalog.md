# T3 Extension Catalog Architecture

Status: material S6 amendment awaiting explicit acceptance

Linear: GBT-37

Source baseline: `fa184dceb92188d965583fa237e84499426b10d7`

## Acceptance

- Accepted by: Jordan
- Accepted on: 2026-07-14
- Accepted design revision: `27e91b6dc53d8f672463d7c5d88fb6a1028354ee`
- Accepted hosted artifact SHA-256: `7294881cec5fb4e99d29eddf9f32945ed5e9175f6b0ed064ff96669ca4a4809b`
- Stable acceptance URL: `https://giggabit-server.tailfb378a.ts.net/reports/t3code-nightly-topic-review.html`

Implementation is authorized only for this accepted contract. A Material Extension Change returns to hosted-plan review under ADR 0047.

The S6 promotion contract below is a material amendment proposed on 2026-07-16. Current workspace policy already overrides ADR 0044's earlier no-approval language: automation may verify and hold an exact Staging assembly, but it may not drain, snapshot, stop, move, or relaunch Main until Jordan freshly approves that exact held revision. The uncommitted S6 remediation remains implementation-draft evidence only until the amended hosted plan is explicitly accepted.

## Outcome

Jordan's replay topics become independently selectable, versioned T3 Extensions that can be installed again after upstream T3 Code changes substantially. The public `J-Giggles/t3code-extensions` monorepo owns the Extension Host contracts, adapters, bundles, official catalog, public preset, installer, authoring kit, compatibility evidence, and documentation. Upstream T3 Code keeps only the minimal host attachment, generated registration, public lock, and protected local overlay state.

The current replay stack migrates incrementally. `prompt-settings` is the tracer-bullet conversion. Until each Conversion Parity Gate passes, its Legacy Replay Topic remains authoritative. One Stack Assembly Manifest prevents the replay and bundle forms from activating together.

## Product Model

```text
Official catalog
├── Jordan Base Stack (public preset, every selected bundle required)
│   ├── remote-access
│   ├── runtime
│   ├── project-git
│   ├── provider-settings
│   ├── composer
│   ├── prompt-settings
│   ├── app-automation
│   ├── project-agent-files
│   └── observability
├── community-verified bundles
└── Extension Authoring Kit

Protected local state
└── Jordan Operator Overlay (private/local preset, every selected bundle required)
    ├── dev-launch
    └── nightly-omarchy-launcher
```

Historical follow-ups become acceptance behavior of their parent bundle: the four remote-access follow-ups fold into `remote-access`, and `runtime-staging-identity` folds into `runtime`. `desktop-tests`, `operations-docs`, and `topic-replay-safeguards` become Platform Evidence Components, not catalog choices. On-the-Go is a future public bundle after parity.

## Runtime And Package Boundary

```text
Extension Bundle artifact
        │ verified digest + provenance
        ▼
Transactional installer ── resolves exact graph ── writes split locks
        │
        ▼
T3 Extension Host
├── capability broker ───── brokered worker/process (default)
├── host-rendered/sandboxed UI contributions
├── permissions + secret-reference bindings
├── data namespaces + transactional migrations
├── health + bounded restart + circuit breaker
└── official integrated bundle bridge (exception; full trust; rebuild)
        │
        ▼
Extension Host Adapter ─── exact upstream T3 Code revision
        │
        ▼
Minimal Bootstrap Patch ── thin attachment to upstream surfaces
```

An Extension Bundle has one version and lifecycle even when it contains contracts, server, client-runtime, web, desktop, mobile, documentation, and test packages. Direct imports across extension internals are forbidden. Collaboration occurs only through independently versioned Host Capabilities or an Extension Capability Provider.

## Initial Host Capability Families

1. settings and configuration registration;
2. typed server RPC and service registration;
3. web and mobile UI slots and navigation;
4. client-runtime state and event contributions;
5. provider prompts, settings, usage, and control actions;
6. project services and project-scoped UI;
7. desktop IPC, shell automation, and MCP tools;
8. routed HTTP and WebSocket exposure;
9. telemetry and observability;
10. host-owned storage, migrations, permissions, and lifecycle.

Each concrete capability is small, immutable once published, separately versioned, permission-scoped, and declared required or optional by the bundle. Adapters may expose multiple major versions concurrently. Retirement requires no supported lock to depend on the version, migration guidance, replacement evidence, and an accepted material-change plan.

## Trust And Supply Chain

Official catalog artifacts are rebuilt, tested, attested, and signed by catalog-controlled GitHub Actions from reviewed immutable source. Manually uploaded binaries are never official artifacts. The official platform and Jordan-authored bundles use Apache-2.0. Third-party licenses must be explicit and redistribution-compatible.

The official catalog distinguishes `official`, `community-verified`, and `external` support tiers. Community admission requires a source PR, complete bundle evidence, catalog rebuild, and approval by a catalog maintainer other than the submitter. Shell, network, credential, native-code, or broad-filesystem authority receives an additional Privileged Extension Review.

Brokered Extension Execution is the default permission boundary. Community and external bundles cannot request same-process execution. Integrated Extension Execution is an exceptional official-only full-trust path requiring explicit authorization, security review, and rebuild activation.

## Installation, State, And Lifecycle

Installation is one all-or-nothing transaction: resolve the cycle-free graph, verify artifacts and provenance, match required and optional capabilities, show permissions and the per-surface Activation Plan, snapshot affected data, migrate, register, build or restart as declared, check, then activate the whole graph. Failure restores the previous artifact, lock, registration, configuration, and data snapshot.

Disable preserves code and data but stops registration. Uninstall removes code and registration while retaining the host-governed Extension Data Namespace. Purge is the separate destructive data removal. Forward migrations are transactional; downgrade is refused without a tested reverse migration.

The repository commits the Public Base Lock and portable non-secret configuration. The Private Overlay Lock and machine bindings live in protected T3 Code state outside the public repository. A Combined Assembly Digest binds both locks, upstream, adapter, and manifest. Presets, artifacts, locks, exports, logs, and reports contain named Extension Secret References but never secret values.

## Compatibility And Upstream Movement

Compatibility is certified against exact upstream commits or evidence-proven commit ranges. Results are `certified`, `certified-with-degradation`, `unknown`, or `unsupported`. Normal installation refuses unknown and unsupported combinations. A development override cannot create a support or distribution claim.

An adapter may emulate a removed upstream capability only when the complete accepted semantics, authority, failures, and invariants still pass. Otherwise nightly retains the Known-Good Assembly and publishes a decision plan; it does not weaken a required capability or carry an unconstrained patch.

## Nightly Assembly And Promotion

```text
Latest upstream
   │
   ▼
Stack Assembly Manifest
   ├── adapter + bootstrap
   ├── remaining Legacy Replay Topics
   ├── exact Public Base Lock
   ├── protected Private Overlay Lock
   └── Platform Evidence Components
   │
   ▼
Nightly assemble → certify → visual/test evidence
   │ all gates pass and contract is unchanged
   ▼
Durable Nightly proof → durable Staging proof
   │
   ▼
Awaiting Main approval (Main remains untouched)
   │ fresh approval bound to held revision, locks, artifacts, and lane proofs
   ▼
Complete Main drain → snapshot Linux + Mac → prepare both
   │
   ▼
Activate both → relaunch both → Live Main Acceptance on both hosts
   ├── pass: publish `promoted`
   └── fail: restore previous complete assembly
              ├── restored proof passes: publish `recovered`
              └── recovery proof fails: stop + critical alert
```

Contract-Preserving Updates may autonomously reach a durable, fully verified Staging hold. Main promotion always requires fresh explicit approval bound to that exact held record, candidate revision, artifact vector, split locks, Combined Assembly Digest, and Nightly/Staging lane proofs. Before approval, the truthful terminal status is `awaiting-main-approval`, never `promoted`, and Main remains untouched. A Material Extension Change—changed accepted behavior, expanded permission, destructive or irreversible migration, or lost surface—requires a newly accepted hosted plan before even entering this promotion path.

After approval, one coordinated two-host transaction closes admission, drains all product-owned work, snapshots the Linux primary and Mac launcher checkout, prepares both without activating either, activates and relaunches both, and proves the live application on both hosts. Any failure after either host changes restores both snapshots and verifies the previous Known-Good Assembly on both hosts.

The drain covers the complete product lifecycle: admitted orchestration/SQLite transactions, provider turns through fully processed terminal events, runtime ingestion, extension and product migrations, durable writes, streams, reactor/checkpoint queues, thread deletion, and registered background work. Already-admitted work may finish nested writes under its inherited admission token; unrelated work is refused. Admission cannot reopen while tracked work remains unresolved.

Protected activation receipts prove real installation, not archive metadata: the verifier removes every artifact-owned path from an exact source checkout, reinstalls the immutable artifact closure, performs frozen dependency installation, runs the focused behavior suite and launcher proof from the activated checkout, and binds artifact, installed-tree, behavior, path, and receipt digests. Operational helper, launcher, and command logs remain mode-protected and are omitted from public evidence.

Every bundle in Jordan's two presets is required. Optional capability degradation inside a bundle remains possible only when declared, certified, tested, and visible. A brokered runtime crash receives bounded restart, then opens an Extension Circuit Breaker. A required bundle failure invalidates Live Main Acceptance and promotion.

## Visual And Review Contract

Every extension release carries architecture/package and install/capability/lifecycle diagrams. UI bundles carry exact-version screenshots from headed tests; non-UI bundles carry sequence, state, or data-flow diagrams. Every visual includes alternative text, caption, source revision, bundle version, and producing test or command. Visual drift fails documentation validation.

The stable tailnet Nightly Extension Dashboard links to immutable run pages containing status, revisions, locks and digest, topic and extension changes, plans, certification, tests, visuals, live proof, and rollback evidence. A morning notification links to the dashboard when Main changes, recovery occurs, or a decision is required.

## Implementation Slices

| Slice | Deliverable                                                                                                             | Exit boundary                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| S1    | Public monorepo, immutable capability schemas, Host/Adapter/Bootstrap skeleton, split-lock and manifest schemas         | Contract tests prove versioning, graph resolution, and public/private state boundaries without product behavior               |
| S2    | Catalog build, artifact provenance, installer transaction, trust/license/support metadata, admission workflow           | A tiny reference bundle can be built twice reproducibly, installed, refused, rolled back, and audited                         |
| S3    | Brokered runtime, permission/secret broker, data lifecycle, activation, health, circuit breaker, Extension Manager      | Fault tests prove isolation and lifecycle; integrated execution remains an explicit official-only exception                   |
| S4    | `prompt-settings` tracer conversion and mixed-mode nightly assembly                                                     | Clean upstream parity proves legacy and bundle forms are mutually exclusive and behavior-equivalent                           |
| S5    | Public bundles converted one at a time; parent follow-ups folded into owners                                            | Each bundle passes its existing topic matrix, new platform contract, visuals, and clean-upstream certification before cutover |
| S6    | Operator Overlay, verified Staging hold, approval-bound two-host Main transaction, complete drain, live proof, rollback | Exact combined assembly waits without touching Main, then promotes only after bound approval and recovers both hosts safely   |
| S7    | Authoring kit, reference bundles, contributor workflow, versioned docs and dashboard                                    | A fresh contributor can scaffold, test, document, build, and submit without private repository knowledge                      |
| S8    | On-the-Go conversion and eligible legacy replay retirement                                                              | All eligible topics are locked bundles; remaining evidence components have explicit platform ownership                        |

No slice may exit with an uncovered stable test ID from [the catalog test contract](./t3-extension-catalog-test-contract.md) or from an affected topic plan.

## Risks

- Rich sandboxed UI is the largest architectural risk. The tracer bundle must prove host-rendered or isolated contributions before broad conversion.
- Integrated execution can become an escape hatch. CI and admission policy must reject it outside official, explicitly full-trust bundles.
- Split public/private locks can drift. The Combined Assembly Digest and transaction must bind and roll them back together.
- Exact upstream certification can slow adoption. Known-good retention is intentional; weakening a required behavior is not an acceptable shortcut.
- Converting commit-shaped topics directly would expose historical boundaries as product choices. Parent fold-ins and Platform Evidence Components prevent that.
- Main promotion has a larger blast radius than staging-only replay. A fresh approval bound to the exact held assembly, complete product drain, coordinated Linux/Mac snapshots, live proof on both hosts, and complete verified rollback are one indivisible feature.

## Definition Of Done

- Every row in the catalog test contract and every affected topic feature matrix has passing normal, refusal/failure, and invariant unit evidence in its owning slice.
- Relevant property, fault, integration, headed, accessibility, performance, native, replay, supply-chain, migration, recovery, and live-tailnet suites pass in addition to unit tests.
- `vp check` and `vp run typecheck` pass; mobile changes also pass `vp run lint:mobile`.
- Visual evidence is version-bound, self-contained, accessible, and drift-checked.
- A clean upstream checkout can reproduce the exact public base, bind a protected overlay, and prove the combined digest.
- The stable dashboard and immutable run page agree with the promoted or retained Main assembly.
- No implementation starts until Jordan explicitly accepts the hosted plan revision required by the workspace policy.

## Accepted Decisions

ADRs [0028 through 0063](../adr/README.md#extension-distribution) remain the accepted baseline. Proposed ADR [0064](../adr/0064-hold-verified-staging-for-approved-two-host-main-promotion.md) operationally supersedes ADR 0044's no-approval language and narrows ADR 0060 when this amended hosted revision is explicitly accepted.
