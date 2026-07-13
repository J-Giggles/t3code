# Keep voice queues durable and independent of the mode toggle

Response and Attention Queues are durable account-level state that continue collecting while On-the-Go Mode is off, survive app and server restarts, and synchronize handled state across devices. Enabling On-the-Go Mode announces current counts without replaying historical arrival tones. This prevents missed agent work and duplicate handling while keeping the mode toggle responsible only for the voice session, not the underlying work inbox.
