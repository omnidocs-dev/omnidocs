# Editing validation

- `npm test`: 56 passing tests, including native Markdown and the supplied Structurizr source, stable IDs/properties, scoped creation, directed relationship updates, preview synchronization, source hashes, locale-independent revisions, conflict rejection, symlink rejection, real temporary-file saves/backups, rollback after a partial save failure, and the browser folder adapter with test handles.
- `npm run build` and `npm run build:portable`: both completed. The existing large-bundle warning remains.
- Browser: created an external system, created its directed REST/HTTPS connection, changed its name, and reviewed the three changed Markdown files without touching the real project. Dragging a source handle to a target handle opened the connection form with the correct endpoints. Applying a gRPC connection updated the canvas; discarding the draft restored the original edge count. No browser console errors/warnings were observed.
- Mobile viewport 390×844: edit controls wrapped within the page width; no horizontal document overflow.
- The supplied project's 38 Markdown files remain byte-identical to the pre-edit baseline. Test writes used temporary folders; no fixture elements were saved into the real project.

## Remaining verification limits

- Native browser folder selection/write permission was not completed end to end. The folder writer's revision checks, backups, file writes, and conflict behavior were tested through its directory-handle adapter; server filesystem writes were tested on real temporary files.
- A live local HTTP roundtrip could not be checked from this restricted execution environment: loopback fetch returned EPERM and the browser could not reach the test server. The local API wiring is type-checked; its workspace store has real filesystem integration tests.
- No Java runtime or official Structurizr exporter is installed here, and the download hosts were unreachable from execution tools. Incremental DSL edits are structurally checked and explicitly marked for official re-export/inspection; they are not a fresh official parser/inspection result.

## Graphical connection flow

Draw connection activates a canvas tool, not an endpoint form. Browser verification covered a pointer-following preview line, Escape cancellation during a drag, output/input port colors and a roughly 16-pixel hit target at overview zoom, correct directed endpoints after drop, no endpoint dropdowns, a gRPC draft edge, and restoring the original edge count after discarding. Node movement is disabled while the drawing tool is active.

## Connection deletion

Regression tests cover removing one parallel Structurizr relationship while preserving its sibling and the separately declared C2 relationship, cleaning exact/quoted DSL include references, refusing dependent DSL syntax, removing native view/flow references, and real temporary-file persistence with original-source backups. Browser checks covered toolbar deletion (16 to 15 edges), Undo (back to 16), keyboard Delete, ignoring Delete while editing an input, and the three-file save review. The real project source was not modified by these checks.

## Smoother relation routes

The router now scores heading changes, with a length-based sharing cost, and renders bounded rounded corners. On the supplied unchanged logistics model, total turns fell from 78 to 47 in C1, 346 to 162 in expanded C1, and 242 to 99 in standalone C2. Maximum turns per edge fell from 10/20/18 to 5/6/6 respectively. All 16/55/39 relationships retained routes.

Tests sample rounded paths against card interiors and check exact directed endpoints, finite short-segment geometry, parallel paths, and a bound on zigzags in the expanded fixture. Browser checks found no sampled card intrusions in the expanded or standalone C2 views; moving particles use exactly the rendered path. No console errors/warnings were observed.

## Spaces and automatic persistence (2026-11-14)

- Added independent catalog folders, space creation/selection, remembered browser selection, per-space endpoints, and default-space API compatibility. New spaces contain one primary system with C1/C2 documents and locally synchronized Structurizr source/snapshot; no business architecture is invented.
- Real temporary filesystem tests create a space, add containers/components and a C3 view, reopen it, edit both old and new elements, update/delete directed connections, and verify derived previews, backups, stale-revision rejection, isolation from other spaces, and catalog stability after recreating the catalog object. Native Markdown next-level creation is also covered.
- Express integration tests use an in-memory HTTP stream (no TCP socket): creation token, cross-origin rejection, scoped save/read, conflict response, missing space, and preservation of the default workspace all pass.
- All 62 tests pass, and the production and portable builds pass (the existing bundle-size warning remains).
- Browser UI checks use an isolated HTML harness with mocked API responses, because direct loopback access remains unavailable here. These cover space creation/selection, remembered selection, adding a person with Auto-save, editing the original system, per-space POST routing, and a 409 error that keeps the form and last saved canvas intact. No console errors/warnings were observed. These are UI/request-routing checks, not proof of a live browser-to-server filesystem roundtrip.
- `npm run studio` builds and starts the production app. `Start OmniDocs.command` provides the macOS launcher. The real project's source documents were not used as edit targets during QA.
- Auto-save applies complete submitted commands; incomplete keystrokes are not written. Saved changes retain backups; Undo remains limited to unsaved drafts. BPMN XML, arbitrary prose editing and element deletion remain outside the visual editor scope. A fresh official Structurizr parser/export/inspection remains unverified.

## Required item categories and discoverable C3 creation (2026-11-15)

The Add item form now requires an explicit grouped category appropriate to the chosen C4 level. Application/data/messaging subtypes are persisted in `omnidocs.type` in both canonical DSL properties and the JSON snapshot; native Markdown properties use the same key. Existing containers can receive/change this subtype without changing their structural C4 kind, stable ID or parent. Explicit subtypes control visual cues even when technology is not a recognized keyword. In Structurizr, databases and brokers remain containers, following C4's application/data-store abstraction.

A permanent **C3 · Components** editing action opens a parent-container picker from any architecture view, including C1. It resolves the owning C2 view, creates a scoped C3 view or opens an existing one, and handles the no-container case with instructions. Add item also links to this dialog. Empty views now point to the visual editor.

Five additional regression tests pass: category persistence and structural mapping; classifying/reclassifying old containers without duplicate DSL properties; constructing C3 and a handler from the supplied model without writing its source; rejecting invalid level/type pairs; and native data-container C3 support. All 67 tests pass. Browser checks on an isolated portable preview cover creating C3 from C1, choosing a parent, required grouped type selection and adding a typed Controller/Handler to the resulting C3 canvas. The same browser session confirmed the C2 application/data/messaging option groups, added a Database with an unrecognized custom technology, and reviewed canonical DSL containing both controller/database subtype properties. No browser console errors/warnings were observed. These browser edits remained unsaved drafts; all 38 real source documents remained byte-identical. Official Structurizr parser/export validation remains pending as documented above.

## Bind the opened project folder to every save (2026-11-15)

Open folder now acquires a read/write directory handle and reads that same directory. The handle belongs to the active App workspace, surviving editor sessions, manual Review & save and Auto-save. The save path contains no directory picker; permission denial or conflict does not clear the handle. Snapshot-only input browsers are directed to the local server for editing. Embedded portable snapshots request connection before editing, instead of asking for a destination at Save. Reload current folder reads the same handle; changing Space/folder resets the destination explicitly.

All 69 tests pass, including repeated saves to one folder, isolation from another project, conflict/reload/retry, and permission reuse/renewal/denial. Production and portable builds pass with the existing bundle-size warning. In an isolated browser harness using an in-memory directory-handle implementation, Open folder was called once, two separate editing sessions each completed Review & save into that handle, two backups were created, and Reload current folder read the updated model with the picker count still one. No console errors/warnings were observed. This verifies UI-to-adapter behavior; the native OS folder permission dialog and browser-to-real-filesystem roundtrip remain unverified. Local server Space persistence continues to use its tested filesystem store. Portable folder connection is retained for the open page, not persisted across a fresh page reload.

## Empty-folder confirmation and compatibility reports (2026-11-15)

Open folder now distinguishes empty directories, supported document folders, incompatible Markdown and nonempty folders without Markdown. Empty directories display project fields plus exact starter-file previews; only the explicit confirmation writes. Initialization rechecks emptiness immediately before saving, validates generated files, writes with the existing conflict/backup adapter, rereads the result, and connects the same folder. Existing supported models load with a visible compatibility report; unsupported input preserves the previous model and files. Snapshot-only imports explicitly report view-only capability and disable visual editing.

The 72-test suite includes starter creation and reread/validation, preview without writes, refusal to initialize nonempty folders or folders changed while awaiting confirmation, ordinary Markdown and invalid references, stale DSL digests, and view-only snapshots. Browser verification used an isolated in-memory directory-handle harness: Cancel left zero files; confirming created five Markdown documents and loaded C1/C2; reopening produced a compatible report without new writes; opening a prose-only README produced specific errors while retaining the previous project. No console warnings/errors were observed. Native OS permission and actual browser filesystem writes remain outside this harness's evidence. The real Logistics project's 38 source documents remain byte-identical.

## Protocol fields and labels (2026-11-15)

Verified that C1 intentionally omits protocol from arrow labels while technical views append it. The editor now puts C1 protocol in optional advanced details with explanatory copy; existing values remain editable and saved. Technical relationship labels reserve their last line for a documented protocol, preventing long descriptions from hiding it. Two regressions cover protocol retention under truncation and unchanged ordinary/context label wrapping. No source-document changes were required.

## Views grouped by level and scope (2026-11-15)

New C1/C2 starter documents use `views/c1-context/system.main/` and `views/c2-containers/system.main/`; C3 creation uses `views/c3-components/<container-id>/`. The shared path policy also supports C4 code and supplementary view categories. Keys and scopes determine stable filenames/folders, preserving support for multiple views per scope.

The Organize view folders command migrates old flat `views/*.md` and `studio/views/*.md` view documents, updates relative Markdown links, preserves IDs and canonical DSL/JSON bytes, and removes originals only through the existing save transaction with backups. The changeset supports deleted paths so server/browser stores can roll back moves. Existing custom hierarchies remain in place.

All 78 tests pass, including real temporary-disk migration and backup recovery, preserving canonical bytes and fenced/inline code, link rebasing, idempotence, scoped C3 paths, and browser-adapter rollback after a later deletion fails. Production and portable builds pass with the existing size warning. An isolated browser harness reviewed the move without writing, saved the new paths, removed the old paths, retained backup copies and the updated README links, and used the same selected folder without another picker. No console errors/warnings were observed. This harness used an in-memory directory adapter; native OS permission limitations remain as documented above.

## Item deletion and contextual canvas actions (2026-11-15)

Added entity.delete with a server-validated cascade flag. Deletion cleans owned descendants, scoped views, their source documents, attached relationships and surviving diagram references. Native boundary membership, entry points, flows and bindings are updated; canonical Structurizr declarations and exact include references are removed with synchronized JSON/digests. Ambiguous DSL dependencies and removal of the primary home scope are rejected. File removal uses the existing backup/rollback store and browser adapter. Context action requests are reset when changing workspace and consumed once so they cannot replay after reconnecting or finishing editing.

All 82 tests pass, including new Structurizr exact deletion/source freshness, cascade consent, primary-system protection, native boundary/flow cleanup and real temporary-filesystem deletion with backed-up view documents. A read-only in-memory smoke test also deleted a person from the supplied Logistics model without model errors; real source files were not written. Existing move/deletion rollback tests remain green.

Browser verification used an isolated directory-handle harness: card context Edit opened the correct item, Delete opened counts and confirmation, Cancel wrote nothing, confirmed deletion removed the item/connection, and a subsequent container cascade removed its child and scoped view file with backups. Keyboard Delete opened the same cascade confirmation. Card context Open next level worked; background Add item targeted C2, and arrow context displayed inspect/edit/delete actions. Menus fit at viewport edges, focus the first action, support ArrowDown and close with Escape. No console errors/warnings were observed. Native OS permission and real browser filesystem writes remain outside this harness's evidence. Official Structurizr parser certification remains pending.

## Grow frames during dragging and editing (2026-11-15)

Removed the fixed parent extent from movable cards and added controlled parent sizing to node changes. Child positions reserve header/side padding; parents grow right/down from deepest nested scope to outermost frame without shrinking during dragging. Frame restoration includes parent IDs and dimensions, rejects incompatible cached child coordinates, and places newly added cards away from restored siblings. The draft preview no longer clears all manual positions. Disconnected ELK components use explicit frame spacing. Layout position/size retention remains per open Studio session, separate from Markdown model persistence.

All 86 tests pass, including growth past the old frame bottom/right, protecting frame headings, restoring siblings without overlap, nested parent growth and preserving root-card freedom. Browser checks used an isolated C2 fixture: simulated mouse dragging increased frame height from 716 to about 949 diagram units and allowed two cards to align vertically; switching C1/C2 restored the exact positions and grown size. After connecting a test directory adapter, adding a third item preserved the two manual positions, avoided overlap and grew the frame further. No console warnings/errors were observed. The attached user screenshot was the defect reference; no real project documents were edited for these checks.

## Keep expanded working areas above overview items (2026-11-16)

Added explicit hierarchical node/edge stacking and manual React Flow z-index control, disabling automatic selection elevation. Whole expanded subtrees paint after overview nodes; nested scopes paint above their siblings; the active expanded branch paints last among expanded peers. View-specific edge layers keep internal links above backgrounds and overview links behind expanded scopes. Clicking/dragging descendants promotes their branch, and dragging clears stale focus dimming. Node resizing retains assigned layer values.

Five regression tests cover overview selection, nested C3, competing expanded branches and collapse, standalone boundary/edge/card ordering, and growth preserving layer order. Browser verification used an isolated fixture: opening C2 produced overview node z10/11, boundary z12, child z14; dragging the child grew its boundary from 390 to 886 diagram units wide over a C1 external card, and hit testing still returned the C2 child. Selecting that external card retained the order. Nested C3 yielded parent z12, inner boundary z14 and child z16. No document edits were required.
