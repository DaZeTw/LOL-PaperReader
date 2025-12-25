# Repository, Folder, and File Organization Guidelines

This document defines how we organize repositories, folders, and files for both backend (Python) and frontend (TSX/Next.js).
The goal is to prevent mega-files, unclear ownership, and junk folders while keeping logic easy to find and scale.

---

## 1. Core Repository Structure (Standard Skeleton)

Every repository must follow this structure:

.gitlab/  
- Issue templates  
- Merge request templates  
- CI/CD configuration  

docs/  
- Architecture diagrams  
- API specifications  
- Onboarding guides  

scripts/  
- One-off scripts (migrations, seeding, maintenance)  

src/  
- All active source code  

tests/  
- All tests  
- Must mirror the structure of src  

Example:

src/services/auth.py  
tests/services/test_auth.py  

---

## 2. Backend Organization (Python)

We use a **layered architecture** to clearly separate API, business logic, and external systems.

### Folder Responsibilities

api/  
- Routes and controllers  
- Input validation only  
- No business logic  

services/  
- Business orchestration  
- Controls the order of operations  

models/  
- Database schemas and data models  
- No business logic  

integrations/  
- External systems (OpenAI, S3, Elasticsearch, etc.)  

utils/  
- Pure helper functions  
- Stateless logic only  

### Backend Flow Rule

- api/ calls services/  
- services/ call utils/ and integrations/  
- utils/ never call services/ or integrations/  

---

## 3. Backend Services: The Manager Principle

Service files act as **Managers**, not Workers.

### Workers
- Do one small task  
- Pure logic (parse, calculate, format)  
- Live in utils/ or logic files  

### Managers (Services)
- Control the flow of a feature  
- Call workers and integrations  
- Handle sequencing and coordination  

### When to Create a Service File

Create a new service file when introducing:
- A new business entity  
  - user_service.py  
  - paper_service.py  
- A new business process  
  - upload_orchestrator.py  
  - billing_service.py  

### Service File Structure

Each service file should follow this logical order:
1. Imports (workers and integrations)
2. Service class
3. Methods, each representing a feature flow

Example flow:

utils/pdf.py  
- extract_text(bytes)

integrations/s3.py  
- upload_file(file)

services/paper_service.py  
- process_new_upload()  
  - calls extract_text  
  - calls upload_file  
  - saves to database  

---

## 4. Frontend Organization (TSX / Next.js)

We use a **feature-based structure** to avoid a large, unmanageable components folder.

### Folder Responsibilities

components/  
- Global reusable UI atoms  
- Buttons, inputs, modals  

features/  
- Grouped by product functionality  
- Each feature owns its logic  

hooks/  
- Global reusable React hooks  

store/  
- Global state management (Zustand or Redux)  

### Feature Folder Structure

Each feature folder contains:
- components/  
- hooks/  
- api.ts  

Example:

features/auth/  
- components/LoginForm.tsx  
- hooks/useLogin.ts  
- api.ts  

---

## 5. Frontend Logic Pattern: Action and Hook

Frontend logic is split into **API services** and **orchestrator hooks**.

api.ts  
- No React code  
- Stateless API calls only  

useAction.ts  
- Manages loading, error, and data state  
- Calls api.ts  

Component.tsx  
- Calls the hook only  
- No API logic  

Flow:

Component → Hook → api.ts → Backend

---

## 6. File Naming, Size, and Ownership Rules

### Naming Conventions

Python files  
- snake_case.py  

TSX components  
- PascalCase.tsx  

Hooks and utilities  
- camelCase.ts  

---

### One-File One-Job Rule

- Each file has a single responsibility  
- One primary export per file  
- No generic or catch-all files  

Avoid:
- common_service.py  
- general_utils.ts  

Prefer domain-based naming:
- pdf_highlight_service.py  

---

### File Size Limits and Promotion Rule

- 300 lines maximum per file  
- If exceeded, split the file  

If a service grows large, promote it to a folder:

Before:
services/paper_service.py  

After:
services/paper/  
- __init__.py  
- crud.py  
- analysis.py  
- export.py  

---

## 7. Where-To-Put-It Guide (Quick Decision)

Use this checklist when adding new code:

Does it touch a database or external API?  
- Yes → services/ (backend) or features/x/api.ts (frontend)  

Is it a pure calculation or formatting logic?  
- Yes → utils/  

Does it define a visual UI element?  
- Yes → components/  

Is it reusable stateful React logic?  
- Yes → hooks/  

---

## 8. Summary Reference

Code Type | Backend Location | Frontend Location | Rule
--------- | ---------------- | ----------------- | -----
External API or DB | integrations/ | features/x/api.ts | No logic
Pure logic | utils/ | utils/ | Input to output only
Feature flow | services/ | hooks/ | Orchestrates logic

---

Following these rules keeps the codebase organized, scalable, and easy to reason about.
