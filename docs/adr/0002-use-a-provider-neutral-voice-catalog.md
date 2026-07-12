# Use a provider-neutral voice capability catalog

On-the-Go Mode selects its Transcription Model, Theo Model, and Speech Configuration from capabilities declared by configured cloud and local providers rather than from a fixed vendor list. This adds a provider capability contract up front, but avoids coupling the voice experience to one vendor and lets each picker expose only compatible models through T3 Code's existing provider-instance architecture.
