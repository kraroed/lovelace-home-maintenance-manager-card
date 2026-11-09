# Home Maintenance Manager Card

A custom Home Assistant Lovelace card for the [Home Maintenance Manager integration](https://github.com/kraroed/home-maintenance-manager).

The card provides a household maintenance overview with task status, due dates, equipment, completion history, and interactive maintenance actions.

## Features

- Maintenance summary counts, including overdue and due-today tasks.
- List view with status filters and dynamically generated category filters.
- Monthly calendar view with previous/next month navigation, a Today shortcut, and selectable dates.
- History view with search and completion-date filters.
- Task details with inspection guides: how to inspect, what to look for, what to do if something is wrong, and safety precautions.
- Equipment records and links between equipment and maintenance tasks.
- Mark-complete action with optional completion notes.
- Reschedule action with a reason and retained schedule-change history.
- Automatic discovery of Home Maintenance Manager entities; individual entity IDs are not required.
- Supports multiple Home Maintenance Manager configuration entries.

## Requirements

- Home Assistant.
- The [Home Maintenance Manager integration](https://github.com/kraroed/home-maintenance-manager) installed and configured.
- HACS, or manual installation.

The card calls the integration's `home_maintenance_manager.complete_task` and `home_maintenance_manager.reschedule_task` services. It is a frontend companion and does not replace the integration.

## Install with HACS

1. Open **HACS** in Home Assistant.
2. Open the three-dot menu and choose **Custom repositories**.
3. Add `https://github.com/kraroed/lovelace-home-maintenance-manager-card`.
4. Select **Dashboard** as the category, then add the repository.
5. Find **Home Maintenance Manager Card** in HACS and download it.
6. Reload your browser if the card does not appear immediately.

HACS installs the JavaScript module and registers the dashboard resource. When installed through HACS, use the `/hacsfiles/` resource path only if you need to add it manually; normally HACS handles registration.

## Add the card to a dashboard

Add a **Manual** card and use:

```yaml
type: custom:home-maintenance-manager-card
title: Home Maintenance
show_equipment: true
show_history: true
```

All options are optional. The defaults are shown above.

## Manual installation

1. Download `home-maintenance-manager-card.js` from this repository.
2. Copy it to `/config/www/home-maintenance-manager-card.js`.
3. In **Settings → Dashboards → Resources**, add:
   - URL: `/local/home-maintenance-manager-card.js`
   - Resource type: **JavaScript Module**
4. Add the Manual card configuration shown above.

Do not add a second resource if HACS has already registered the card.

## Updating

When a new version is released, update the card through HACS. Reload the browser if it continues displaying an older version.

## Issues and feature requests

Please report issues in the [GitHub issue tracker](https://github.com/kraroed/lovelace-home-maintenance-manager-card/issues). For integration, sensor, service, or scheduling issues, use the [Home Maintenance Manager integration repository](https://github.com/kraroed/home-maintenance-manager/issues).

## License

MIT
