# Wave 2 Follow-ups

These are non-blocking review notes carried forward after Wave 2 hardening.

## Keep Under Review

- Attempt timeout policy is not yet a fully separate stale-attempt sweeper. We now enforce terminal lifecycle rules and fail closed correctly, but automatic promotion of long-running attempts to `unresponsive` still deserves a dedicated policy pass.
- Corrupt flow state currently fails closed and preserves the broken file for inspection. This is safer than auto-resetting, but if operator recovery proves noisy we may want an explicit repair path in a later lifecycle hardening pass.
