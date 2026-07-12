# Use only pre-approved voice fallbacks

Each Transcription Model, Theo Model, and Speech Configuration may define an optional ordered Voice Fallback Chain. T3 announces every switch and never silently sends speech or context to an unapproved provider. When transcription has no approved fallback, voice input fails closed and produces no command; local wake, sleep/off controls, tones, badges, and queue state remain available. This trades seamless but opaque failover for predictable privacy, cost, and intent handling.
