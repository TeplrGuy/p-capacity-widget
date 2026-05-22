# Story Capacity Widget for Azure DevOps

An Azure DevOps **dashboard widget** that replicates the OOB **Sprint → Work Details** capacity pane, but reads **Remaining Work from User Stories** instead of Tasks.

Built for teams that prefer a **Stories-only** workflow (no Task work items) yet still want at-a-glance per-developer and per-Activity capacity visualization on their dashboards.

![Widget preview](static/icon.png)

## Why this widget?

The built-in **Sprint Work Details** pane only renders when an iteration has **Task** work items — it aggregates `Microsoft.VSTS.Scheduling.RemainingWork` from Tasks. Teams who track effort directly on **User Stories** (e.g. by mirroring `Story Points → Remaining Work` via a process rule) get a blank pane.

This widget gives the same UX on any dashboard, pulled from Stories:

- **Per-Activity bars** (Design, Development, Testing, …) — remaining vs. capacity
- **Per-person bars under each Activity** — remaining vs. that person's capacity for that Activity
- **Collapsible sections** + **user avatars** with initials fallback
- **Remaining working days** math (matches the OOB pane)
- **Configurable iteration** — pin to any sprint or follow the current one
- Red bar when remaining > capacity (over-allocated)

## Requirements

- Azure DevOps Services (cloud) or Azure DevOps Server 2020+
- Your team has **Iteration**, **Working Days**, and **Capacity** configured (Sprint → Capacity tab)
- Your User Stories have `Remaining Work` populated (manually, or via a process rule from `Story Points`)
- (Optional) `Activity` field set on each Story for the per-Activity breakdown

## Install

### From source (private install to your org)

1. Clone this repo.
2. Build:

   ```powershell
   cd capacity-widget
   npm install
   npx webpack --mode production
   ```

3. Package & publish to your Marketplace publisher:

   ```powershell
   # one-time: create a publisher at https://marketplace.visualstudio.com/manage
   # one-time: set publisher id in vss-extension.json
   $env:TFX_PAT = "<your Azure DevOps PAT with Marketplace (manage) scope>"
   npx tfx extension publish `
     --manifest-globs vss-extension.json `
     --share-with <your-org-name> `
     --token $env:TFX_PAT `
     --no-prompt
   Remove-Item Env:TFX_PAT
   ```

4. Install the shared extension into your org:
   `https://dev.azure.com/<your-org>/_settings/extensions` → **Shared** tab → install **Story Capacity Widget**.

### From a prebuilt VSIX

Download the latest `*.vsix` from [Releases](../../releases), then in **Organization Settings → Extensions → Manage Extensions → Upload extension**.

## Use

1. Open any **team dashboard**: `https://dev.azure.com/<org>/<project>/_dashboards`.
2. **Edit** the dashboard → **Add a widget**.
3. Search for **Story Capacity** → drag onto the dashboard.
4. Click the widget's **⋯ → Configure** to pick an iteration (default is the team's *current* iteration).
5. **Save** the dashboard.

The widget reads `[System.IterationPath]`, `[Microsoft.VSTS.Scheduling.RemainingWork]`, `[Microsoft.VSTS.Common.Activity]`, and `[System.AssignedTo]` from **User Story** work items in the selected iteration, and pairs them with the team's capacity records.

## Mirror `Story Points → Remaining Work` (optional but recommended)

So devs only have to fill `Story Points`:

1. Project Settings → **Process** → your inherited process → **User Story** → **Rules** → **+ New rule**.
2. Conditions: *When a work item is created or modified* → *When the value of `Story Points` changes*.
3. Actions: *Set the value of `Remaining Work`* to `Story Points`.
4. Save & publish the process.

Now any `Story Points` edit auto-updates `Remaining Work`, which feeds this widget.

## Required scopes

Declared in `vss-extension.json`:

- `vso.work` — read iteration, capacity, work items
- `vso.project` — list teams
- `vso.profile` — current user (for avatar fallback)

Re-installing after a scope change requires an org admin to **re-approve permissions**.

## Project layout

```
capacity-widget/
├── src/
│   ├── capacityWidget.tsx   # main widget React app
│   ├── capacityWidget.html  # widget iframe entry
│   ├── capacityConfig.tsx   # configuration UI (iteration picker)
│   ├── capacityConfig.html  # config iframe entry
│   └── capacityWidget.scss  # styles (Segoe UI, OOB-look)
├── static/
│   └── icon.png             # widget catalog icon
├── vss-extension.json       # extension manifest
├── webpack.config.js        # IIFE bundle (window library), no AMD
├── tsconfig.json
└── package.json
```

## Build notes & gotchas

- **Bundle must be IIFE** (`output.library.type = "window"`), *not* AMD. The ADO widget iframe has no AMD loader, so AMD output fails with `define is not defined`.
- **SDK must be bundled** via `import * as SDK from "azure-devops-extension-sdk"` — *not* loaded as a separate `<script src="SDK.min.js">` (same AMD issue).
- **Widget contribution id**: register the handler under both the short id (`"story-capacity-widget"`) and the full id (`SDK.getContributionId()`) — the dashboard host may call either.
- **`WidgetStatusType.Success = 0`**, `Failure = 1` (counter-intuitive).
- **REST calls** use direct `fetch` with `SDK.getAccessToken()` rather than `getClient(...)` — more diagnostic when something goes wrong.
- **Working days** = today → iteration end (matches OOB), not full sprint length.

## License

[MIT](LICENSE)
