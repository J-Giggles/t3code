# Keep synchronized Theo data inside the T3 server boundary

Synchronized Theo data is encrypted at rest and scoped by user/project inside the authenticated T3 Code server trust boundary. The server decrypts it only for authorized queue, context, profile, and selected-model orchestration; device caches use OS-protected encrypted storage. T3 creates no separate third-party Theo datastore and does not claim end-to-end encryption while server-side orchestration requires plaintext. This makes the real trust model explicit and auditable.
