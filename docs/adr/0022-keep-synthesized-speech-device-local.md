# Keep synthesized speech audio ephemeral and device-local

T3 synchronizes durable text, Spoken Rendering structure, citations, and sentence-level playback position, but keeps synthesized speech in an encrypted device-local Speech Audio Cache that expires within 24 hours or sooner under storage pressure. A new Voice Session Owner re-synthesizes under its current Speech Configuration and output-privacy policy. This avoids synchronizing private spoken content while preserving cross-device continuity.
