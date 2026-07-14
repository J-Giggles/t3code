# Adapt speech to output privacy

T3 classifies headphones, earpieces, and explicitly trusted routes as Private Output and device loudspeakers as Public Output. Private Output permits full Spoken Rendering except credentials and secrets; Public Output defaults to summaries, redacts sensitive values, and avoids verbatim private connected-app content. Users may explicitly allow fuller loudspeaker playback for the current session, but secrets are never spoken. This preserves useful hands-free behavior without assuming every audio route is private.
