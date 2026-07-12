# Enforce context egress from source to Theo provider

Every Context Source declares a Context Egress Policy identifying which local or cloud Theo providers may receive its excerpts. Theo sends only the minimum relevant material; if the selected Theo Model is incompatible, the source is skipped with an explanation rather than silently transferring restricted data or switching providers. This makes broad default source access compatible with source-specific privacy and organizational policy.
