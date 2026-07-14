# Isolate prompt dictation from command execution

“T3, dictate a prompt” enters Dictation State, where ordinary speech—including action-like phrases—is interpreted only as editable draft text. Formatting/editing controls shape the draft, Canonical Safety Phrases remain active, and “Finish dictation” returns it for review; “Send it” remains mandatory. This prevents prompt content such as “delete the file” from being misrouted into an executable Voice Action.
