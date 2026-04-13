---
name: pr-workflow
description: Automates the full PR lifecycle after a task is complete. Creates a branch, commits, pushes, opens a PR, waits for GitHub Copilot code review, triages feedback, dispatches model-matched sub-agents to fix valid issues, and replies to review comments.
---

# PR Workflow Skill

Automates the end-of-task PR lifecycle for the QuestGen repository. Invoke this workflow AFTER your main task is complete and all changes are ready to ship.

## Preconditions

Before invoking this skill, the main implementation must already have been completed as smaller logical tasks. For each task, the repo workflow must already have been followed:

1. meaningful failing tests first
2. implementation
3. `npx vitest run`, `npm run typecheck`, and `npx next build`
4. code review with a different-model subagent
5. fix/retest/re-review until clean

Do not use this PR workflow as a substitute for the task-by-task verification loop.

## Step 1: Create & Push PR

1. Ensure you have uncommitted changes — if not, abort.
2. Create a new branch from `main` with a descriptive name (e.g., `fix/map-creaion, `feat/add-inventory-list`).
3. Stage all changes and commit with a clear message. **The commit message MUST start with a [Gitmoji](https://gitmoji.dev) emoji** (e.g., `✨ Add new feature`, `🐛 Fix bug`, `🔧 Update config`). Always include the Co-authored-by trailer:
   ```
   ✨ Add star rating system

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```
4. Push the branch to origin.
5. Open a PR via `gh pr create --fill` (or provide an explicit `--title` and `--body` summarizing the changes). **The PR title MUST start with a Gitmoji emoji** matching the primary change type.

## Step 2: Wait for Copilot Code Review

After the PR is created, the GitHub Copilot reviewer will automatically start a code review. Poll for it:

1. Use the GitHub MCP tools (`pull_request_read` with method `get_reviews`) or `gh pr reviews` to check for reviews.
2. The reviewer's login is **`copilot-pull-request-reviewer`**.
3. The review can take several minutes. Poll with increasing intervals:
   - Start at **30 seconds**
   - Increase to **60 seconds**
   - Cap at **120 seconds**
4. Continue polling until a review from `copilot-pull-request-reviewer` appears with a submitted status.

## Step 3: Fetch & Triage Review Comments

Once the review is submitted:

1. Fetch all inline review comments/suggestions using `pull_request_read` with method `get_review_comments` or equivalent.
2. **Critically evaluate each comment** — the reviewer is NOT always right. For each comment, decide:

   | Verdict | Criteria |
   |---------|----------|
   | **VALID** | Fixes a real bug or performance issue |
   | **VALID** | Improves code quality meaningfully |
   | **SKIP** | Style preference or nitpick with no functional impact |
   | **SKIP** | Would break existing functionality |
   | **SKIP** | Misunderstands the codebase context |

3. Log your triage decision for each comment before proceeding.

## Step 4: Dispatch Fixes with Model-Matched Sub-Agents

For each comment triaged as **VALID**:

1. Identify the file affected by the comment.
2. Implement the fix.
3. Run tests if applicable to verify the fix doesn't break anything.

## Step 5: Reply to Review Comments

After each fix is implemented, reply to the corresponding inline PR review comment:

- Include a **brief description** of what was changed.
- Example reply:
  > Fixed in abc1234. Added an early return guard to stop the animation loop when the title screen is dismissed.

## Step 6: Push & Finalize

1. Stage and commit all fixes with a Gitmoji-prefixed message and the Co-authored-by trailer:
   ```
   🐛 Fix review feedback on breakout collision

   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```
2. Push to the PR branch.
3. Run tests if applicable to verify fixes don't break anything.

## Important Notes

- **Invoke this workflow only after the main task is complete.**
- The main task should already be broken into smaller logical tasks, each completed with tests, smoke tests, and different-model code review before the PR stage begins.
- Always check for uncommitted changes before starting.
- If the Copilot review finds no issues, note that the review was clean and finish.
- If ALL review comments are invalid/skippable, document why each was skipped and finish without code changes.
