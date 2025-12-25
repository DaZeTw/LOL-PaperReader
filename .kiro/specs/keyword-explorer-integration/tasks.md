# Implementation Plan: Keyword Explorer Integration

## Overview

This implementation plan integrates the keyword exploration functionality from `keywordz-react` into the Paper Reader application. The tasks are organized to build incrementally, starting with core utilities, then components, then integration with the existing UI.

## Tasks

- [x] 1. Set up keyword extraction utilities
  - [x] 1.1 Create keyword extractor service
    - Create `lib/keyword-extractor.ts` with keyword categories and extraction logic
    - Port `KEYWORD_CATEGORIES` from `keywordz-react/src/utils/pdfKeywordExtractor.js`
    - Implement `extractTextFromPDF` using pdfjs-dist (already in project)
    - Implement `findKeywords` with word-boundary regex matching
    - Implement `getCategoryForKeyword` helper
    - Implement singular/plural merging logic
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Write property tests for keyword extraction
    - **Property 2: Word Boundary Matching Accuracy**
    - **Property 3: Keyword Categorization and Counting**
    - **Property 4: Singular/Plural Merging**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

- [x] 2. Create useKeywordExtraction hook
  - [x] 2.1 Implement the hook
    - Create `hooks/useKeywordExtraction.ts`
    - Manage extraction state (keywords, loading, error, stats)
    - Implement `extractKeywords` function that calls the extractor service
    - Implement `reset` function for document switching
    - _Requirements: 1.1, 6.5_

  - [x] 2.2 Write property test for document switch reset
    - **Property 9: Document Switch State Reset**
    - **Validates: Requirements 6.5**

- [x] 3. Checkpoint - Verify keyword extraction works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create Taxonomy API backend routes
  - [x] 4.1 Create taxonomy routes file
    - Create `backend/src/paperreader/api/taxonomy_routes.py`
    - Implement `/api/taxonomy/search` endpoint for concept search
    - Implement `/api/taxonomy/concepts/{id}` endpoint for concept details
    - Implement `/api/taxonomy/concepts/{id}/siblings` endpoint
    - Implement `/api/taxonomy/concepts/{id}/descendants` endpoint
    - Register routes in main.py
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 4.2 Write property tests for Taxonomy API
    - **Property 10: Taxonomy API Contract**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 5. Create useTaxonomyAPI hook
  - [x] 5.1 Implement the hook
    - Create `hooks/useTaxonomyAPI.ts`
    - Implement `fetchKeywordData` function (search + get concept + siblings + descendants)
    - Implement `fetchConceptById` function for graph node clicks
    - Handle loading and error states
    - _Requirements: 3.4, 4.4, 7.5_

- [x] 6. Checkpoint - Verify API integration works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Create KeywordPanel component
  - [x] 7.1 Implement KeywordPanel
    - Create `components/keyword-panel.tsx`
    - Display keywords grouped by category
    - Show keyword chips with occurrence counts
    - Display extraction statistics (unique keywords, total occurrences, pages)
    - Handle loading and error states
    - Wire up useKeywordExtraction hook
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 7.2 Write property test for keyword panel rendering
    - **Property 5: Keyword Panel Rendering**
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 8. Create KeywordPopup component
  - [x] 8.1 Implement KeywordPopup
    - Create `components/keyword-popup.tsx`
    - Display keyword name and taxonomy level
    - Display document context (occurrence count)
    - Display definition from API
    - Display related keywords (siblings, descendants, ambiguous)
    - Handle click outside and Escape key to close
    - Handle loading and error states
    - Wire up useTaxonomyAPI hook
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 8.2 Write property tests for popup content
    - **Property 6: Popup Content Rendering**
    - **Property 7: Related Concepts Display Limit**
    - **Validates: Requirements 3.2, 3.3, 3.4, 4.1, 4.2, 4.3**

- [x] 9. Create MiniGraph component
  - [x] 9.1 Implement MiniGraph
    - Create `components/mini-graph.tsx`
    - Install react-force-graph-2d dependency
    - Build graph data from concept, siblings, descendants
    - Render central node with primary color
    - Render sibling nodes with sibling color
    - Render descendant nodes with descendant color
    - Render ambiguous nodes with ambiguous color
    - Display legend for node colors
    - Handle node click to navigate to concept
    - Handle empty data state
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 9.2 Write property test for graph node rendering
    - **Property 8: Knowledge Graph Node Rendering**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 10. Checkpoint - Verify components work standalone
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Add styles for keyword components
  - [x] 11.1 Create keyword component styles
    - Add styles to `styles/globals.css` or create `styles/keyword-components.css`
    - Port relevant styles from `keywordz-react/src/styles/components.css`
    - Style keyword chips, popup, graph container, legend
    - Ensure styles work with existing theme (light/dark mode)
    - _Requirements: 6.4_

- [x] 12. Integrate with Right Sidebar
  - [x] 12.1 Add Keywords tab to RightSidebar
    - Update `components/right-sidebar.tsx`
    - Add "Keywords" tab with Tag icon
    - Render KeywordPanel when Keywords tab is active
    - Pass pdfUrl and documentId to KeywordPanel
    - Handle keyword click to open popup
    - _Requirements: 6.1, 6.2_

  - [x] 12.2 Wire up popup portal rendering
    - Render KeywordPopup as portal to document.body
    - Manage popup state (selected keyword, position)
    - Handle popup close
    - _Requirements: 6.3_

- [x] 13. Integrate with PDF Reader
  - [x] 13.1 Connect keyword extraction to document load
    - Update `components/pdf-reader.tsx`
    - Trigger keyword extraction when PDF loads
    - Pass extraction results to RightSidebar
    - Handle document switching (reset extraction)
    - _Requirements: 1.1, 6.5_

- [-] 14. Final checkpoint - Full integration testing
  - Ensure all tests pass, ask the user if questions arise.
  - Test end-to-end flow: Load PDF → Extract keywords → Click keyword → View popup → Navigate graph

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation follows existing patterns in the Paper Reader codebase
