---
status: accepted
---

# Schedule media work by resource and risk

Media Dock 3.0 gives each Task Batch an explicit bounded concurrency choice of 1, 2, or 3 tasks, represented internally by Safe, Balanced, and Fast Scheduling Profiles. The default is 2; the same ceiling applies to total work, one source, and one Authentication Profile so a selected Bilibili series can genuinely run two or three member downloads while never becoming unbounded. Task Batch order is preserved as intent, failures do not abort remaining members, runtime maintenance stays separate from media execution, activation affects only later task starts, and version cleanup waits until no Task Plan or active execution references the managed runtime.
