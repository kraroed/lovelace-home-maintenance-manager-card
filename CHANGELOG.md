# Changelog

## Unreleased

## 1.8.1

### Usability
- Clarify that completion and schedule history search supports property names.

### Testing
- Add regression coverage for the property-name search prompts.

## 1.8.0

### Improvements
- Display friendly configured property names in completion history.
- Display friendly configured property names in schedule-change history.
- Include property names in history search.
- Preserve the technical integration instance identifier in tooltips and as a fallback for older integration versions.

### Compatibility
- Friendly property names are supplied by Home Maintenance Manager integration v0.15.0 and newer.
- Older integration versions continue to display the technical property identifier.
- No card configuration changes or service-call changes.
