# Limit background voice sessions to native apps

Electron keeps On-the-Go Mode active while minimized, and native mobile keeps it active while backgrounded or screen-locked with the platform-required microphone indicator or notification. Hosted web supports On-the-Go Mode only while its tab is foregrounded because browser background audio cannot provide the same dependable contract. Every session ends when explicitly disabled, the app terminates, the user signs out, or microphone permission is revoked.
