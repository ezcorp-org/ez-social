# Phase 4: Chat & Draft Generation - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Per-post persistent chat where users discuss posts with AI and generate voice-matched draft replies. Each queued post gets its own conversation thread. Users can discuss the post, request drafts in their persona's voice, refine drafts through natural language, edit inline, and copy the final result. Chat history persists across sessions.

Does NOT include: voice calibration feedback loops (Phase 5), new queue management features, persona CRUD changes.

</domain>

<decisions>
## Implementation Decisions

### Chat conversation flow
- Opening a post's chat shows the original post content at the top as a pinned context card (not a chat message — always visible)
- Chat starts with a short AI greeting that acknowledges the post and persona: "Ready to help you draft a reply to [author]'s post as [persona]. What angle do you want to take?"
- No rigid "discuss then draft" flow — user can request a draft immediately or discuss first; the AI should be responsive to either
- Requesting a draft is natural language ("draft a reply", "write something", "give me a response") — no special buttons or modes
- When the AI generates a draft, it wraps the actual reply text in a visually distinct "draft block" within the chat message
- Post status transitions: `new` → `in_progress` (on first message sent), `in_progress` → `draft_ready` (when first draft is generated)

### Draft display & interaction
- Drafts appear inline in the chat as part of the AI's message, rendered in a distinct card/block with a slightly different background (not a separate panel)
- Each draft block has: the draft text, a copy button (top-right), and a character/word count
- Copy button uses clipboard API, shows brief "Copied!" confirmation
- Inline editing: user clicks an "Edit" button on the draft block, text becomes editable in-place, save/cancel buttons appear
- Edited versions are stored separately (manualEdits pattern from Phase 2) — original AI version preserved
- Version history: each refinement ("make it shorter") creates a new draft block in the chat flow — the conversation IS the version history
- No separate version panel or dropdown — scroll up to see previous drafts in context of the conversation that produced them

### Context & persona in chat
- Original post displayed as a fixed/pinned card above the chat scroll area (always visible, not scrolled away)
- Post card shows: author name, platform badge, post content (truncated with expand), URL link
- Active persona shown in a subtle bar or badge near the chat input: "[Persona name] voice"
- Persona switching: user can type "switch to [persona]" or use a persona dropdown near the input — switching adds a system-style message to chat noting the change
- AI context includes: full original post content, active persona's voice profile (extractedProfile + manualEdits merged), and full conversation history
- System prompt instructs AI to match the persona's voice characteristics when generating drafts but to converse naturally when discussing

### Chat navigation & history
- Chat lives on the existing `/queue/[id]` page — replaces the Phase 4 placeholder
- Full conversation persists in the database (chat_messages table with role, content, metadata)
- Returning to a post's chat loads full history (no pagination for now — conversations are typically short)
- Queue table rows on dashboard link directly to `/queue/[id]` which is the chat (no separate "chat" route)
- Back navigation from chat returns to dashboard with scroll position preserved (browser default)
- No separate "chats" listing — posts ARE the entry point to chats

### Streaming implementation
- Use `@ai-sdk/svelte` Chat class for the chat interface (first real usage — Phase 2 used raw fetch)
- Server endpoint uses `streamText` with `toUIMessageStreamResponse()` (not toTextStreamResponse used in Phase 2)
- Chat class reactive getters pattern (use `chat.messages`, not destructured — per documented Svelte 5 gotcha)
- SSE streaming for real-time token display
- `onFinish` callback on server side to persist the complete AI message to the database

### Claude's Discretion
- Exact system prompt wording and structure for the AI chat
- Chat message bubble styling (colors, spacing, alignment)
- Loading/typing indicator design during streaming
- How to detect "draft request" intent vs general discussion in the AI prompt
- Error states and retry UX for failed AI requests
- Empty chat state design (before first message)
- Mobile responsive layout adjustments for chat
- Character count display format and positioning
- How many tokens of conversation history to include in context window

</decisions>

<specifics>
## Specific Ideas

- The chat should feel like a natural conversation, not a rigid tool — similar to how you'd brainstorm a reply with a friend who knows your voice
- Draft blocks should be visually distinct enough that you can quickly scan a long conversation and spot all the generated drafts
- The copy interaction should be fast and obvious — one click, immediate feedback, done
- Follow the existing codebase patterns: hand-rolled Tailwind (no component library), service factory pattern, Svelte 5 runes throughout
- Use the same Anthropic model and API key pattern established in Phase 2 voice extraction

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-chat-draft-generation*
*Context gathered: 2026-02-18*
