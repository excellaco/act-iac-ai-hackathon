# Claude Code Instructions

## PR Workflow

Follow this process when opening a pull request:

1. **Create a feature branch** — one branch per story or related set of stories.
2. **Move associated GitHub issues to In Progress** — use `gh issue edit <number> --add-label "in-progress"` or update the project board status before starting work.
3. **Before opening the PR — move associated issues to In Review**:
   ```
   gh issue edit <number> --add-label "in-review"
   ```
   Do this for every issue covered by the PR. Do not close issues at this stage.
4. **Open the PR** using `gh pr create --body-file` (write body to a temp file to avoid heredoc/quoting issues).
5. **After the PR is merged — close the associated issues**:
   ```
   gh issue close <number>
   ```
   Issues should only be closed once the PR is confirmed merged, not before.
