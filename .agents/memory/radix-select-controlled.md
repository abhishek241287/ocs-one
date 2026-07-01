---
name: Radix Select must be controlled
description: Why the shared SelectField must pass value ?? "" instead of a possibly-undefined value
---

# Radix Select uncontrolled→controlled desync

A shared select wrapper (shadcn/Radix `Select`) fed `value={value}` where `value`
starts `undefined` (uninitialized form field) makes Radix operate in **uncontrolled**
mode, then flip to **controlled** on first selection. This produces a React
controlled/uncontrolled warning AND an intermittent failure where the picked option
does not bind into form state — the trigger snaps back to the placeholder and "no
value is saved".

**Rule:** always pass `value={value ?? ""}` to Radix `Select`. `""` is Radix's
documented controlled-empty state (shows the placeholder); `SelectItem` values are
always non-empty, so `""` never matches an item. This makes the component
deterministically controlled from first render.

**Why:** the Material Master "Link To Component Master" select intermittently lost
its selection; every master select shares one `SelectField`, so the fix belongs in
the shared component (platform-level), fixing all master selects at once.

**How to apply:** fix it in the shared field wrapper, not the leaf page. Do not
special-case one field. Watch for the same undefined-value pattern in any other
controlled-input wrapper.
