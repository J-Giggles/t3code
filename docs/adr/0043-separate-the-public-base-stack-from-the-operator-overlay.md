# Separate the public base stack from the operator overlay

Status: accepted

Jordan's preferred installation will be expressed as two composable versioned presets. The public Jordan Base Stack contains generally reusable extensions that anyone may discover and install. The Jordan Operator Overlay contains private or local-only extensions tied to Jordan's machines, credentials, launchers, infrastructure, or personal operating practices. Every Extension Bundle must declare Extension Visibility as `public`, `private`, `local-only`, or `deprecated`; presets cannot widen that visibility, and publication never occurs merely because a legacy topic was selected by Jordan's stack.

The combined installed result remains the Jordan Extension Stack. Its public documentation can describe the overlay boundary, but must not publish private metadata, artifact locations, configuration values, or operational evidence.

## Considered Options

- Publish all converted topics in one preset: simplest to describe, but risks exposing machine-specific operations and makes the public preset non-portable.
- Keep the entire stack private: protects local details, but prevents reuse of the broadly useful extensions.
- Compose a public base with a private operator overlay: adds a classification step, but preserves shareability without weakening privacy or portability.
