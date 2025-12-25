# Requirements Document

## Introduction

This feature integrates the keyword exploration functionality from the `keywordz-react` prototype into the main Paper Reader application. The integration enables users to discover, explore, and understand technical keywords found in research papers through automatic extraction, definitions, and interactive knowledge graphs showing concept relationships.

## Glossary

- **Keyword_Extractor**: The service that extracts predefined technical keywords from PDF document text
- **Keyword_Panel**: The UI component that displays extracted keywords grouped by category
- **Keyword_Popup**: The overlay component showing keyword details, definitions, and relationships
- **Knowledge_Graph**: An interactive force-directed graph visualization showing concept relationships
- **Taxonomy_API**: The backend service providing concept definitions, siblings, and descendants
- **PDF_Viewer**: The existing PDF viewing component in the Paper Reader application

## Requirements

### Requirement 1: Keyword Extraction from PDFs

**User Story:** As a researcher, I want keywords automatically extracted from the PDF I'm viewing, so that I can quickly identify key technical concepts in the paper.

#### Acceptance Criteria

1. WHEN a PDF is loaded in the viewer, THE Keyword_Extractor SHALL extract text from all pages of the document
2. WHEN text extraction completes, THE Keyword_Extractor SHALL identify occurrences of predefined technical keywords using word-boundary matching
3. THE Keyword_Extractor SHALL categorize found keywords into predefined categories (Machine Learning, Neural Architectures, NLP & Language Models, Computer Vision, AI Concepts)
4. THE Keyword_Extractor SHALL count the number of occurrences for each keyword found
5. THE Keyword_Extractor SHALL merge similar keywords (singular/plural forms) into a single entry with combined counts

### Requirement 2: Keyword Panel Display

**User Story:** As a researcher, I want to see all extracted keywords in an organized panel, so that I can browse and explore concepts found in the paper.

#### Acceptance Criteria

1. WHEN keyword extraction completes, THE Keyword_Panel SHALL display keywords grouped by their category
2. THE Keyword_Panel SHALL show each keyword as a clickable chip with its occurrence count
3. THE Keyword_Panel SHALL display statistics including total unique keywords, total occurrences, and number of pages processed
4. WHILE keywords are being extracted, THE Keyword_Panel SHALL display a loading indicator
5. IF keyword extraction fails, THEN THE Keyword_Panel SHALL display an error message

### Requirement 3: Keyword Popup with Definitions

**User Story:** As a researcher, I want to click on a keyword to see its definition and context, so that I can understand unfamiliar technical terms.

#### Acceptance Criteria

1. WHEN a user clicks on a keyword chip, THE Keyword_Popup SHALL appear near the clicked element
2. THE Keyword_Popup SHALL display the keyword name and its taxonomy level (if available)
3. THE Keyword_Popup SHALL display the context showing how many times the keyword appears in the document
4. THE Keyword_Popup SHALL fetch and display the definition from the Taxonomy_API
5. WHEN the user clicks outside the popup or presses Escape, THE Keyword_Popup SHALL close
6. WHILE definition data is loading, THE Keyword_Popup SHALL display a loading indicator
7. IF the Taxonomy_API request fails, THEN THE Keyword_Popup SHALL display a fallback message

### Requirement 4: Related Keywords Display

**User Story:** As a researcher, I want to see keywords related to the one I selected, so that I can explore connected concepts and expand my understanding.

#### Acceptance Criteria

1. THE Keyword_Popup SHALL display sibling concepts (up to 5) as clickable tags
2. THE Keyword_Popup SHALL display descendant concepts (up to 5) as clickable tags
3. WHERE ambiguous concepts exist, THE Keyword_Popup SHALL display them as clickable tags
4. WHEN a user clicks on a related keyword tag, THE Keyword_Popup SHALL update to show that concept's details
5. IF no related keywords exist, THEN THE Keyword_Popup SHALL display "No related keywords found"

### Requirement 5: Interactive Knowledge Graph

**User Story:** As a researcher, I want to visualize the relationships between concepts in a graph, so that I can understand how technical terms relate to each other.

#### Acceptance Criteria

1. THE Knowledge_Graph SHALL display the selected concept as a central node
2. THE Knowledge_Graph SHALL display sibling concepts as connected nodes with distinct color
3. THE Knowledge_Graph SHALL display descendant concepts as connected nodes with distinct color
4. WHERE ambiguous concepts exist, THE Knowledge_Graph SHALL display them as connected nodes with distinct color
5. THE Knowledge_Graph SHALL use force-directed layout for automatic node positioning
6. WHEN a user clicks on a non-central node, THE Knowledge_Graph SHALL trigger navigation to that concept
7. THE Knowledge_Graph SHALL display a legend explaining node colors
8. IF no graph data is available, THEN THE Knowledge_Graph SHALL display "No graph data available"

### Requirement 6: Integration with Paper Reader UI

**User Story:** As a user, I want the keyword explorer to integrate seamlessly with the existing Paper Reader interface, so that I can use it alongside other features.

#### Acceptance Criteria

1. THE Keyword_Panel SHALL be accessible from the right sidebar of the PDF viewer
2. THE Keyword_Panel SHALL be toggleable via a sidebar tab or button
3. THE Keyword_Popup SHALL render as a portal to avoid z-index conflicts with the PDF viewer
4. THE Knowledge_Graph SHALL be responsive and fit within the popup container
5. WHEN switching between PDFs, THE Keyword_Panel SHALL clear previous results and extract keywords from the new document

### Requirement 7: Taxonomy API Backend Integration

**User Story:** As a developer, I want the keyword data to be fetched from a backend API, so that definitions and relationships can be maintained and updated centrally.

#### Acceptance Criteria

1. THE Taxonomy_API SHALL provide a search endpoint to find concepts by name
2. THE Taxonomy_API SHALL provide an endpoint to get concept details by ID
3. THE Taxonomy_API SHALL provide an endpoint to get sibling concepts
4. THE Taxonomy_API SHALL provide an endpoint to get descendant concepts
5. WHEN API requests fail, THE system SHALL handle errors gracefully and display appropriate messages
