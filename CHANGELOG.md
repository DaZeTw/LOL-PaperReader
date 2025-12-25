# Change Log

## [Unreleased] - 2025-12-23

### Added
- **MetadataTrackingContext**: Created a new React Context and Provider (`contexts/MetadataTrackingContext.tsx`) to manage the tracking of metadata status for newly uploaded documents.
  - Implements `trackDocument(id)` to add documents to a tracking list.
  - Implements internal `SingleDocumentWatcher` components to listen for `isMetadataReady` events via the `usePipelineStatus` hook.
  - Triggers a callback (`onMetadataChange`) when a tracked document's metadata becomes ready.

### Changed
- **LibraryView** (`components/library-view.tsx`):
  - Wrapped critical sections with `MetadataTrackingProvider`.
  - Implemented `handleMetadataRefresh` with debounce logic (2-second delay) to efficiently handle multiple concurrent metadata updates without spamming the API.
  - Connected `handleMetadataRefresh` to the `MetadataTrackingProvider` to trigger reference list reloads automatically.
- **AddReferences** (`components/add-references.tsx`):
  - Integrated `useMetadataTracking` hook.
  - Updated upload logic to automatically call `trackDocument(id)` immediately after a file is successfully uploaded.

### Removed
- **MetadataWatcher**: Removed `components/metadata-watcher.tsx` as its functionality was subsumed by the internal logic within `MetadataTrackingProvider`, simplifying the component hierarchy in `ReferenceTable`.
