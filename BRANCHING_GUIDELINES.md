# Branching Strategy & Creation Guidelines

## The Strategy: GitLab Flow

We follow the GitLab Flow (Feature-Branch) model.

- The `main` branch is always stable and deployable.
- No developer should ever push code directly to `main`.
- All changes must go through Merge Requests.

---

## Branch Naming Convention

All branches must follow this format:

type/issue-ID-short-description

### Allowed Branch Types

| Prefix      | Description                                                   | Example                         |
|-------------|---------------------------------------------------------------|---------------------------------|
| feat/       | A new feature or user story                                   | feat/101-add-pdf-parser         |
| fix/        | A bug fix for existing functionality                           | fix/204-resolve-memory-leak     |
| chore/      | Maintenance, dependencies, or CI/CD updates                   | chore/upgrade-node-v20          |
| docs/       | Documentation changes only                                    | docs/update-api-readme          |
| refactor/   | Code changes that neither fix bugs nor add features            | refactor/api-auth-logic         |

Rules:
- Use lowercase letters only.
- Use hyphens (-) to separate words.
- Do not use spaces, underscores, or camelCase.

---

## Creating a Branch

### Step 1: Start from the Issue

- Navigate to the GitLab Issue assigned to you.
- Click the "Create merge request" button.
- GitLab will automatically:
  - Create a branch named after the issue.
  - Create a Draft Merge Request.

### Step 2: Sync the Branch Locally

Run the following commands on your local machine:

git fetch  
git checkout your-branch-name

---

## Branch Hygiene

- One branch must represent one task only.
- Keep branches short-lived.
- Before submitting a Merge Request, rebase your branch with `main` to avoid conflicts:

git pull --rebase origin main

- All feature branches will be automatically deleted after being merged into `main`.

---

Following these guidelines ensures a clean history, predictable releases, and smooth collaboration across the team.
