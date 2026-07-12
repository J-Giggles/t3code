# Keep Theo read-only across all context sources

Theo may search, read, compare, and summarize every authorized context source, but cannot edit files, execute commands, change settings, approve requests, or communicate externally. His only state-changing capability is submitting a prepared prompt after the user explicitly says “Send it.” This keeps conversational exploration from causing side effects, preserves a clear boundary between Theo and Coding Agents, and still gives Theo enough reach to explain responses and prepare informed follow-up work.
