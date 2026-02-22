# Phase 2: Personas & Voice Profiles - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create personas and extract structured voice profiles from their writing samples. This phase delivers persona CRUD, writing sample input, AI-powered voice extraction, and voice profile display/management. Post queue assignment, draft generation, and voice calibration/feedback are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Persona Management Flow
- Quick create — name only to start, low friction entry. Details added later.
- Personas live on a dedicated `/personas` page (not sidebar), linked from main nav.
- List view shows: name, description, and a brief voice summary (e.g., "Casual, witty, uses analogies").
- Deletion is soft delete (archive) — persona is hidden but data preserved, can be restored.

### Writing Sample Input
- Single text area — user pastes all writing samples into one box at once.
- User selects platform/type via dropdown or tags (Twitter, LinkedIn, blog, etc.) to indicate where the writing came from.
- Users can add more samples later and re-extract to refine the voice profile.
- Each extraction creates a new version of the voice profile — users can revert to any previous version.
- Extraction UX is streaming — voice traits appear progressively as the AI processes, giving real-time feedback.

### Voice Profile Display
- Both a natural language summary at top and structured traits below (Tone, Vocabulary, Patterns, Quirks with bullet points/tags).
- User can manually edit individual traits (e.g., change "formal" to "semi-formal", remove a detected pattern).
- Version selector — dropdown or list showing each version with date, user can switch between them.
- Show source stats — display what the profile was built from: sample count, types, and word count.

### Multi-Persona Workflow
- Default persona exists — one persona is marked as default and pre-selected where a persona is needed.
- No practical limit on persona count — design for scalable lists (search/filter may be needed).
- Personas can exist without a voice profile, but UI nudges user to complete setup (banner, call-to-action).
- Persona is a voice identity that can span platforms — not locked to a single platform.
- Visual identity: each persona shows the color and icon of its associated social platform (Twitter icon + colors, LinkedIn icon + blue, etc.) for quick visual distinction.
- Platform association is for visual identification, not a constraint on usage.

### Claude's Discretion
- Exact page layout and component structure
- Writing sample minimum length guidance (how much text is "enough")
- Voice profile JSONB schema structure
- Search/filter UI for persona lists (if needed at scale)
- Loading states and error handling
- Exact streaming implementation for extraction

</decisions>

<specifics>
## Specific Ideas

- Voice extraction should stream traits in real-time, not just show a spinner — the user should feel the AI "reading" their writing.
- Voice profile versions are important — users might prefer an older extraction and want to go back.
- Platform icon/color as persona visual identity creates immediate recognition in lists and throughout the app.

</specifics>

<deferred>
## Deferred Ideas

- Per-platform voice overrides (different voice for Twitter vs LinkedIn) — Phase 5
- Voice calibration feedback ("sounds like me" / "doesn't sound like me") — Phase 5
- Assigning personas to queued posts — Phase 3

</deferred>

---

*Phase: 02-personas-voice-profiles*
*Context gathered: 2026-02-18*
