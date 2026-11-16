# Interior — components used in Athar

Pulled 2026-11-16 from `https://www.interior.dev/r/<name>.json`, source in `src/components/interior/`.
Install: `bunx shadcn@latest add @interior/<name>`. Each component is a headless `useX` hook plus a
styled example; Motion is the only dependency.

| Component | Where in Athar | API |
|---|---|---|
| Value Flash (`value-flash`) | Lab: run step counts announce a change, then go quiet | `<ValueFlash value={number} format? label? hold? announceAfter? />`, or `useValueFlash(value, { hold?, compare? })` |
| Hold to Confirm (`hold-to-confirm`) | Lab → Keys: removing a key | `<HoldToConfirm onConfirm confirmLabel? duration? resetAfter? disabled?>label</HoldToConfirm>`, or `useHoldToConfirm({ onConfirm, duration? })` |

Considered: New Items Pill (`new-items-pill`, for a live run log), Copy Button (`copy-button`, ids and hashes).
