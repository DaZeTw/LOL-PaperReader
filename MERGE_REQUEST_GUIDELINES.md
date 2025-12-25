# Merge Request (MR) Guidelines

The Merge Request (MR) is the most important part of our development process.  
It is the final gate where we ensure code quality, security, and project stability.

---

## 1. The Rebase-First Policy

To maintain a clean, linear Git history, we do not use merge commits.

### Requirement

- Your branch must be rebased onto the latest `main` before it can be merged.

### How

Run the following commands:

git fetch origin  
git rebase origin/main  
git push origin your-branch-name --force-with-lease

### Result

- The merge method in GitLab is **Fast-forward merge**.
- If your branch is out of date, the **Merge** button will be disabled automatically.

---

## 2. Drafting Your Merge Request

Every Merge Request must be created in **Draft mode**.

- Use the `Draft:` prefix in the MR title.
- This prevents reviewers from reviewing work that is still in progress.

---

## 3. Merge Request Template

When creating a Merge Request, you must fill out the description using the following template:

Brief Summary:  
What does this change do?

Why:  
What is the goal or problem being solved?

Closes:  
Closes #ISSUE_ID

Testing:  
How was this verified?  
Examples:
- Tested locally with Docker
- Added unit tests
- Manual verification

---

## 4. Atomic and Clean Commits

### Squash Commits

- We use **Squash and Merge**.
- Small or temporary commits (e.g. wip, fix typo) will be combined into one clean commit on `main`.

### Commit Message Format

Final commit messages must follow the **Conventional Commits** format.

Examples:

feat(auth): add user authentication  
fix(api): resolve timeout on pdf upload

---

## 5. The Review Process

Code reviews are a collaborative learning process, not a critique.

---

### For Authors

- Self-review your own changes in the GitLab **Changes** tab.
- Assign the MR to yourself while working.
- When ready, assign a peer as the reviewer.
- Do not resolve comments without responding.
- Push fixes or reply, then mark threads as resolved.

---

### For Reviewers

- Approve only when the code meets all standards.
- Clearly mark critical issues as **Required Change**.
- Provide constructive and actionable feedback.

---

## 6. Definition of Done (DoD)

A Merge Request is considered complete only when all conditions below are met:

[ ] All CI/CD pipelines pass (green).  
[ ] The branch is fully rebased with no conflicts.  
[ ] At least one approval from a peer or maintainer is received.  
[ ] All discussion threads are resolved.  
[ ] Documentation is updated, if applicable.

---

## 7. Pro Tips for Fast Merges

- Keep Merge Requests small. Changes under 200 lines are reviewed significantly faster.
- Attach screenshots or screen recordings for UI changes.
- Always include `Closes #ISSUE_ID` to automatically close related issues.

---

Following these guidelines ensures high-quality code, predictable releases, and efficient collaboration across the team.
