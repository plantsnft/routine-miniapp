# Burrfriends Implementation Prompt

Use this prompt at the start of each implementation session to ensure consistency and prevent breaking changes.

---

## Implementation Guidelines

**Source of Truth**: `burrfriends/BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` is the authoritative document. All implementation must align with the plan.

### Before Making Any Changes:

1. **Read the Plan First**: Review the relevant phase in `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md` to understand:
   - What needs to be implemented
   - Which files to create/modify
   - Expected behavior and end-to-end flow
   - Technical considerations and constraints

2. **End-to-End Impact Analysis**: For every change, consider:
   - **Upstream Dependencies**: What code/files depend on what you're changing?
   - **Downstream Effects**: What code/files will be affected by your changes?
   - **Data Flow**: How does data flow through the system (DB → API → UI)?
   - **User Flow**: How does the user interact with this feature?
   - **Error Cases**: What happens when things go wrong?
   - **Backward Compatibility**: Will existing functionality still work?

3. **Existing Functionality Protection**:
   - **Never break existing features**: If modifying shared code, ensure all existing uses still work
   - **Test assumptions**: If unsure about how existing code works, read it first
   - **Incremental changes**: Make small, focused changes that can be verified
   - **Preserve API contracts**: Don't change existing API response structures unless explicitly required

4. **Code Review Checklist**:
   - [ ] Does this match the plan document exactly?
   - [ ] Have I read all related files that might be affected?
   - [ ] Have I considered all error cases?
   - [ ] Will this break any existing functionality?
   - [ ] Have I tested the end-to-end flow mentally?
   - [ ] Are there any edge cases I'm missing?
   - [ ] Do I need to update any other files (types, constants, etc.)?

5. **When in Doubt**:
   - **Ask before changing**: If unsure about impact, explain your analysis and ask for confirmation
   - **Read more code**: Understand the full context before modifying
   - **Check similar patterns**: Look at how similar features are implemented elsewhere
   - **Preserve existing patterns**: Follow existing code style and architecture

### Implementation Workflow:

1. **Plan Review**: Read the relevant phase section completely
2. **Code Exploration**: Read existing related files to understand patterns
3. **Impact Analysis**: Document what will be affected by your changes
4. **Implementation**: Make changes following the plan
5. **Verification**: Verify end-to-end flow still works
6. **Documentation**: Update plan status if needed

### Red Flags (Stop and Reassess):

- ⚠️ Modifying shared utilities without understanding all usages
- ⚠️ Changing database schema without migration strategy
- ⚠️ Breaking existing API contracts
- ⚠️ Removing or significantly altering existing functionality
- ⚠️ Making assumptions about how existing code works without reading it
- ⚠️ Implementing something that doesn't match the plan document

### Success Criteria:

- ✅ All changes align with `BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md`
- ✅ No existing functionality is broken
- ✅ End-to-end flow works as specified
- ✅ Error handling is comprehensive
- ✅ Code follows existing patterns and conventions
- ✅ All related files are updated consistently

---

## Example Usage

When starting a new implementation task, include this prompt:

```
I'm implementing Phase 8 from burrfriends/BURRFRIENDS_GAME_SETUP_PHASED_PLAN_REVISED.md. 
Please ensure:
1. All changes align with the plan document
2. No existing functionality is broken
3. Think through end-to-end impact before making changes
4. Read related files first to understand existing patterns
5. Ask if unsure about impact

Current task: [describe specific task]
```
