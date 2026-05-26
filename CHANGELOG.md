# Changelog

## v1.0.6
- **Fix (#3, Bug A):** Only people in the team's iteration capacity are shown as individual rows. Stories assigned to users outside the team's capacity list now roll up into `Unassigned` (matching the OOB Capacity pane). Previously these created phantom rows with `0` capacity.
- **Fix (#3, Bug B):** When the widget has no saved team setting, it now auto-detects the dashboard's owning team via `HostNavigationService.getPageRoute()` instead of always defaulting to the first project team. Configured `teamId` still wins. Falls back to the first project team only when no team context is present (project-scoped dashboard).

## v1.0.5
- Save button now triggers reliably for Team and Iteration changes (uses `widgetConfigurationContext.notify` instead of WidgetHelpers).
- `supportedSizes` expanded to every cell from 1x1 to 10x10.
- Project committed to GitHub at TeplrGuy/p-capacity-widget for version tracking and rollback.

## v1.0.4
- Initial save-button + sizes fix (partial; superseded by 1.0.5).

## v1.0.3
- `onSave` returns `isValid: true` so dashboards accept the configuration.

## v1.0.2
- Configurable Team picker in widget configuration; widget honors `settings.teamId` instead of always picking the first project team.

## v1.0.1
- First public Marketplace release.