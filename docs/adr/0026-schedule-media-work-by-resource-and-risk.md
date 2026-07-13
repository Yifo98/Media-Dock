---
status: accepted
---

# Schedule media work by resource and risk

Media Dock 3.0 schedules network acquisition, CPU-intensive processing, disk delivery, and managed-runtime maintenance through separate resource lanes rather than one flat concurrency count. Creator View offers Safe, Balanced, and Fast Scheduling Profiles, while Expert Inspector may expose bounded controls; per-source and per-Authentication-Profile limits, automatic backoff, and system capacity remain authoritative. Task Batch order is preserved as intent but compatible stages may overlap, runtime downloads and validation may proceed during media work, activation affects only later task starts, and version cleanup waits until no Task Plan or active execution references the managed runtime.
