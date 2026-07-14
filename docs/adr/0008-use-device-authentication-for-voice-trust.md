# Use device authentication for voice trust

On-the-Go Mode establishes a Trusted Voice Session through the owning device's biometric, PIN, or existing unlocked session rather than treating voice recognition as authentication. Trust may continue through device lock while ownership remains stable, but ownership or headset changes, sign-out, restart, or inactivity timeout downgrade the session to read-only until device authentication succeeds again. This preserves locked-screen use without letting a nearby or imitated voice authorize consequential actions.
