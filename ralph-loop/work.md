# Work Queue

Human-injected tasks. The loop checks this FIRST every iteration.
Add tasks as checkbox items. The loop will do the top unchecked one and mark it `[x]` when done.

## SIMPLIFICATION PHASE — Do these in order, one per iteration

### Round 1: Remove redundant query-saving features (3 overlapping mechanisms)
- [x] **Remove QueryResultComparisonModal entirely.** Delete: `QueryResultComparisonModal.tsx` and tests. Remove from `RightPanel.tsx` / `RunSqlPanel.tsx`. Niche power-user feature nobody asked for.

### Round 2: Remove premature/niche features
- [ ] **Remove DatasetDiscoveryPanel + datasetDiscoveryStore entirely.** Delete: `DatasetDiscoveryPanel.tsx`, `DatasetSearch.tsx`, `stores/datasetDiscoveryStore.ts`, backend `dataset_search.py` router, all related tests. Users paste URLs — they don't need a dataset marketplace.
- [ ] **Remove SchemaDiffModal entirely.** Delete: `SchemaDiffModal.tsx` and tests. Remove from `RightPanel.tsx`. Nobody compares schemas interactively.
- [ ] **Remove OnboardingGuide entirely.** Delete: `OnboardingGuide.tsx` and tests. Remove from `ChatArea.tsx`. The app should be simple enough to not need a guide.
- [ ] **Remove ConversationTemplates entirely.** Delete: `ConversationTemplates.tsx`, `utils/conversationTemplates.ts`, and tests. Remove from `ChatArea.tsx`. Premature feature.
- [ ] **Remove PromptPreviewModal entirely.** Delete: `PromptPreviewModal.tsx` and tests. Remove from wherever it's imported. Dev-only feature.

### Round 3: Remove sharing features (premature)
- [ ] **Remove ShareDialog + SharedConversationView entirely.** Delete both components, the `/shared` route in App.tsx, backend `shared.py` router, all related tests. Sharing can come later when there are actual users.

### Round 4: Consolidate SQL panels
- [ ] **Remove RunSqlPanel (1,624 lines) — keep only SQLPanel.** RunSqlPanel is a bloated duplicate. The inline SQL preview in MessageBubble + SQLPanel is sufficient. Delete `RunSqlPanel.tsx` and all its tests. Remove the "Run SQL" tab from `RightPanel.tsx`.

### Round 5: Clean up stores and dead code
- [ ] **Remove draftStore** if it only stores unsent message drafts — ChatInput can use local state.
- [ ] **Remove QueryHistoryPanel from right panel.** The QueryHistoryDropdown in ChatInput already covers this. Delete `QueryHistoryPanel.tsx` and tests, remove from `RightPanel.tsx`.
- [ ] **Delete all test files that test removed features.** After each removal, grep for orphaned test files and delete them.

### Round 6: Prune backend
- [ ] **Remove `/dataset-search` endpoints and backend router.** The dataset discovery feature is being removed.
- [ ] **Remove `/saved-queries` endpoints if the frontend SavedQueries component is the only consumer — simplify to just query-history.** Evaluate whether saved-queries and query-history can be merged into one.
- [ ] **Audit conversations.py (1,929 lines)** — identify and remove any endpoint that serves a deleted frontend feature (e.g., sharing, comparison).
