---
status: accepted
---

# Match local audio and video by media timing

Media Dock pairs separately downloaded local video and audio tracks only after inspecting their real media metadata. Candidate pairs must have compatible track roles, durations within a bounded tolerance, and compatible timeline start points when both are available. A candidate is accepted automatically only when it is the unambiguous best match for both tracks; ambiguous or incomplete candidates remain visibly unmatched.

File names never influence automatic pairing. They may be similar, translated, truncated, or generated independently by download tools, so using them as evidence could silently combine unrelated media. The Merge Workbench accepts multiple files in one picker, shows the timing evidence for every accepted pair, and creates independent Media Tasks for multiple reliable pairs while leaving original files untouched.
