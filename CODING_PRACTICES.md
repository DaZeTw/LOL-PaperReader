# Coding Practices Guidelines

This document defines file structure, function design, logic organization, and documentation rules for Python backend and TSX frontend code. The goal is to prevent large functions and improve readability, maintainability, and testability.

## 1. File Anatomy (Standard Order)

Every file must follow a predictable top-to-bottom structure.

### Python Backend (.py)

Files must be organized in this order:

1. Imports  
   - Standard library  
   - Third-party libraries  
   - Local project imports  

2. Constants and Enums  
   - File-level configuration  
   - Shared values  

3. Custom Exceptions  
   - Module-specific error classes  

4. Helper Functions  
   - Small pure functions  
   - No side effects  

5. Primary Class or Entry Function  
   - Main purpose of the file  

### TSX Frontend (.tsx)

Files must be organized in this order:

1. Imports  
   - React  
   - External libraries  
   - Local components and hooks  
   - Styles  

2. Types and Interfaces  
   - Props and data models  

3. Constants and Styled Components  
   - UI-related values  

4. Main Component  
   - Exported React component  

5. Sub-components  
   - File-private UI elements  

## 2. Rule of Three for Modularization

To prevent large functions, apply these limits:

- Vertical limit:  
  Functions longer than 30 lines must be split.

- Horizontal limit:  
  Logic nested deeper than 3 levels must be extracted into a new function.

- Argument limit:  
  Functions with more than 3 arguments must group inputs into:
  - A dictionary or dataclass in Python  
  - An object or interface in TypeScript  

## 3. Function Design: Pure vs Side-Effect

Logic and side effects must be separated.

### Pure Functions

- Take input and return output only  
- No database access  
- No API calls  
- No logging  
- Fully testable  

### Orchestrator Functions

- Call pure functions  
- Handle side effects such as:
  - Database writes  
  - API calls  
  - File input or output  

Rule:  
At least 80 percent of logic in a file should be pure functions.

## 4. Logical Flow: Guard Clauses

Avoid wrapping entire functions in if or else blocks.

Use guard clauses to:
- Validate inputs early  
- Return immediately on error  
- Keep the happy path flat and readable  

This applies to both Python and TypeScript.

## 5. Documentation Standards

Comments must explain why the code exists, not how it works.

### Python

- Use docstrings for all public functions and classes  
- Describe purpose, inputs, and outputs  

### TypeScript and TSX

- Use JSDoc comments for exported functions and components  
- Describe intent and constraints  

Rules:
- Do not comment obvious code  
- Comment assumptions, edge cases, and business intent  

## 6. Class vs Function Usage

Avoid unnecessary classes.

Use a class when:
- Managing persistent state  
- Holding external connections such as databases or API clients  
- Representing a long-lived service  

Use a function when:
- Transforming data  
- Validating input  
- Performing calculations  

Rule:  
If it does not require self in Python or this in TypeScript, it should be a function.

## 7. General Rules

- Avoid large or multi-purpose functions  
- Avoid files with mixed responsibilities  
- Do not commit commented-out code  
- Do not place business logic in main.py or root React components  
- Refactor early when files or functions grow too large  

Following these rules keeps the codebase clean, readable, and easy to maintain.
