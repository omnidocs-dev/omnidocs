# Visual editing and persistence

Run `npm run studio` (or the macOS `Start OmniDocs.command` launcher), then open `http://127.0.0.1:4174`. **Spaces → New space** creates a document folder under `projects/`. Existing supported folders, including the configured default project, remain selectable. Space selection is remembered per browser. Finish the current editing session before switching spaces. `spacesRoot` / `OMNIDOCS_SPACES_DIR` changes the catalog directory.

Use **Edit workspace** to enter editing. For local server spaces and connected browser folders, **Auto-save** defaults to on: submitting **Save to Markdown** writes a valid change immediately. It does not save incomplete form keystrokes. New and previously loaded elements use the same **Edit selected** flow. Stable IDs and existing element types remain fixed. **Add item** chooses the exact view/level, type, name, description, and technology. This also works for a view expanded inside another canvas. Select a system/container and use **Open next level** or **Create next level** to open/create its C2/C3 view.

**Draw connection** enables graphical drawing: drag an amber output dot to a teal input dot, then submit its description and protocol. Escape cancels drawing. Select an arrow and choose **Delete connection** or press Delete/Backspace on the canvas to remove that exact relationship. With Auto-save on, deletion writes the files immediately with backups. Save failures preserve the form and last saved model; external changes produce a conflict instead of overwriting documents.

Disable **Auto-save** to stage changes. **Apply to draft** updates only the canvas, **Undo** reverses the latest draft change, and **Review & save** shows before/after file content before persisting it. **Discard draft** restores the loaded files. Undo applies only to unsaved drafts; saved versions are retained under `.omnidocs/history` for manual recovery.

New spaces start with one primary software system, C1 and empty C2. No business architecture or technology is invented. The canonical model is a single Structurizr DSL fence in `architecture-model.md`; `architecture-json.md` is a synchronized locally generated snapshot and `views/*.md` contains derived previews. The source digest and references are checked on every edit. Official Structurizr export/inspection remains pending; this is not official parser certification. Arbitrary Markdown prose editing, repository edits, and persistence of manually dragged coordinates remain outside this editor's scope.

## Manual data flows

In edit mode, select **New manual data flow**, enter a name and description, and choose **Create flow**. On the canvas, select **First item** next to **Start**. The picker groups existing items by C4 level, with C2 containers first. In a new or existing data flow, select a C4 item on the canvas in edit mode and click **Add next item** on its card. Select the destination from the C4 model and choose **Continue**. Reuse an existing connection or describe the data transferred, then choose **Add connection** to save the step. The arrows are numbered in the order they are added.

Flow members keep their original model IDs and appear in their C1, C2, or C3 band. Select a member and use **Open in C4 model** in its details to open the corresponding architecture view when one exists. **Remove item from flow** and **Remove connection from flow** remove view references. The shared model retains those items and connections. Save or submit the flow using the workspace's usual editing controls.

## Deployment diagrams

In edit mode, choose **New deployment view** or open an existing diagram under **Deployment**. Choose **Add item** and search the Kubernetes or infrastructure categories. The catalog covers cluster components, workloads, networking, storage, configuration and access, physical servers, VMs, and infrastructure services. Choose **Custom infrastructure** for a resource outside the catalog. Existing deployment nodes use documented names and technologies as visual cues. **Edit selected** sets an explicit type.

**3D view** shows deployment items as isometric symbols, with the type and item name below each symbol. Deployment boundaries appear as colored zones and arrows follow the tilted grid. Flat and isometric views keep separate layout positions for the same model.

Select a deployment item and choose **Create next level** to document its internals. Use **Draw connection** to record communication between items. In a Structurizr-backed workspace these deployment views and nodes are stored in companion Markdown files alongside the canonical C4 model.

## BPMN processes

In edit mode, choose **New process**, give it a name and description, and create it. Open an existing diagram under **Processes** to edit it. Use the BPMN palette to add tasks, events, gateways, pools and lanes. Select an element to see its name and properties.

Choose **Add pool** in the editor sidebar. The first pool encloses the current process. With a pool or lane selected, use **Add lane above**, **Add lane below**, or the split controls. Drag activities between lanes to assign them.

For activities, pools and lanes, **Linked model item** selects a workspace entity by its original ID. The picker includes C4 and deployment items. Linked elements are highlighted, and **Open linked item** opens its documentation.

Choose **Save process** to save the BPMN 2.0 XML and its bindings in the view's Markdown document. In a workspace using drafts or mandatory review, this stages the edit. Use **Review & save** or **Review & submit** to continue the normal workflow.

## Backend

Run `npm run dev` and open the Vite address, normally `http://127.0.0.1:5173`. The frontend uses the separate local API on port 4174. Or run `npm run build` followed by `npm start` for the built application at `http://127.0.0.1:4174`. `OMNIDOCS_DIR` or `omnidocs.config.json` selects the document folder. `OMNIDOCS_PORT` changes the API/production port; update Vite's proxy if changing the development API port.

`GET /api/spaces` lists supported spaces; token-protected `POST /api/spaces` creates one from name, purpose and optional primary system name. `GET /api/spaces/:id/workspace` and `POST /api/spaces/:id/edits` load and save that space. IDs resolve only to configured catalog folders; clients cannot register arbitrary paths. The default-space endpoints remain compatible.

`GET /api/workspace` supplies source files, a content revision, and a per-process edit token. `POST /api/edits` accepts that revision and up to 100 validated edit commands. Clients cannot submit arbitrary filesystem paths or write arbitrary files. The service is bound to loopback, rejects non-local Host/Origin values, and requires the edit token. This is a local desktop service, not a multi-user authenticated collaboration API; do not expose it publicly as-is.

The server checks the loaded revision before saving, serializes saves, rejects symlink destinations, and saves originals under `.omnidocs/history/<transaction>/` with a manifest. Each changed file is replaced by a temporary-file rename. A failed multi-file save rolls back already-written files when they have not subsequently changed externally. This is recoverable multi-file saving, not a filesystem-wide atomic transaction. External editors should reload after a save.

## Portable HTML

In supporting desktop browsers, **Open folder** requests read/write access at the start, reads that directory's documents, and binds its directory handle to the current project. **Connect folder & edit** does the same when starting from an unconnected embedded snapshot. The connected folder name appears in the header. Auto-save and Review & save reuse that handle, including after Finish editing and starting another edit session; saving never opens a directory picker. Write permission may need renewal on the same handle if revoked. Failed saves retain the current handle and draft. **Change folder** is an explicit operation outside editing; an invalid/cancelled selection keeps the existing project connection. **Reload current folder** reads the latest documents through the same handle, without selecting a path.

The handle is retained while the Studio page is open. A fresh page reload requires connecting a folder again; the portable HTML's embedded snapshot is not rewritten by saving. For a folder remembered across app restarts, use the local server's persistent Space catalog. Browsers without folder write handles can read a snapshot through Open folder, but editing points to the local Studio instead of deferring a path/permission surprise until Save. The browser writer retains backups and conflict checks as described below.

Browsers without folder-write support can use the local backend. A file-upload selection alone grants read access and cannot overwrite local files.

## Source adapters

- Native OmniDocs Markdown: edit YAML frontmatter while retaining document bodies and unrelated fields. New entities use `studio/entities/<stable-id>.md`; view membership and directed relationships update their existing source files.
- Verified Markdown Structurizr: patch the existing declarative DSL at explicit aliases, preserving bodies, tags, source properties, IDs, and unrelated syntax. Add/update people, software systems, containers, components, and directed relationships. The source DSL and incremental JSON snapshot are saved together, including embedded DSL and its SHA-256. Existing derived Mermaid previews marked `preview_role: derived` are regenerated from the resulting view. Authored prose is retained.
- Incremental edits are marked `official-reexport-pending`. The patch index is **not** the official Structurizr parser; graph references, supported edits, and source hashes are checked locally. Existing inspection counts predate these edits. For a new official validation/export, use the [official Structurizr exporter](https://docs.structurizr.com/export) with the saved DSL. The [official binaries](https://docs.structurizr.com/binaries) require Java 21 or Docker; neither is bundled into OmniDocs.
- DSL includes, scripts, plugins, workspace extension, hierarchical identifiers, unsupported declaration/string forms, and unverified snapshots fail explicitly rather than being rewritten approximately. A standalone JSON snapshot without a verified DSL source remains viewable but is not edited by this adapter.

Protocol classification and element colors remain viewer conventions; source C4 kinds and documented relationship directions are preserved.

## Item categories and C3 creation

**Add item → Item type** requires an explicit choice, grouped by the selected view:

- C1: Person / Role or External software system.
- C2: Application / Service, Web application, Mobile application, API application, Background worker; Database, Cache, Message broker / Queue, Object / File storage; supporting people/systems.
- C3: Component, Controller / Handler, Application / Domain service, Repository / Data access, Adapter / Integration; supporting people/systems.
- Native code and deployment views retain their Code element / Deployment node types. BPMN modeling is not enabled by this category picker.

Database, cache, broker and applications retain the structural Structurizr `container` declaration. The subtype is stored in the local `omnidocs.type` property, synchronized in canonical DSL and JSON (or native Markdown properties). This property is an OmniDocs convention, not a new official C4 abstraction. Old documents remain readable; an existing container can be classified without changing its stable ID, parent or structural kind. Explicit classification takes precedence over technology-based legacy visual cues.

To create level 3, choose **Edit workspace → C3 · Components**, select the owning C2 application/container, and choose **Create C3 view**. This works from C1 without first selecting a canvas card. If the container already has a C3 view, the dialog opens it instead of duplicating it. Then use **Add item**, choose a component category, and provide its name, responsibility and technology. If there are no containers, the dialog explains that a C2 application/container must be created first. An Add item shortcut also opens this C3 dialog.


## Empty-folder setup and validation

Open folder inspects the selected directory before connecting it. A genuinely empty folder (ignoring Finder's `.DS_Store`) shows a creation form with project name, purpose, optional primary system name, and previews of the five starter files. Nothing is written before **Confirm · Create these files**. The scaffold contains `README.md`, canonical `architecture-model.md`, synchronized `architecture-json.md`, and `views/c1-context/system.main/SystemContext.md` / `views/c2-containers/system.main/Containers.md`. It is validated before writing, the directory is checked again for concurrent additions, then the actual saved files are reread and validated. The initialized folder remains the save destination.

Existing Markdown folders receive a visible compatibility report: supported adapter, counts, structural/reference errors, declared source-digest checks and import notes. Compatible models load automatically; unsupported models leave the current project and source files unchanged. A renderable Structurizr snapshot without verified DSL can be viewed but its visual editor is disabled. This is validation against supported Studio adapters, not official C4/Structurizr certification. A nonempty directory with no Markdown is reported instead of being initialized over its other contents.

## Relationship protocols by level

C1 describes people, software systems and the purpose/direction of their interactions. Its relationship form puts protocol in optional advanced details; an explicitly recorded value is retained in source and the inspector, while the C1 arrow shows the interaction description. Protocol is not inferred or required.

Technical views show a documented protocol on a separate arrow-label line. For container-to-container links, recording the known protocol/technology is recommended. Shortened long descriptions reserve that protocol line rather than truncating it away. When labels are hidden at overview zoom, zoom in or select/hover the connection to read them.

## View folders

New view documents are grouped by C4 level and stable owning scope:

```text
views/
  c1-context/<system-id>/<view-key>.md
  c2-containers/<system-id>/<view-key>.md
  c3-components/<container-id>/<view-key>.md
  c4-code/<component-id>/<view-key>.md
```

The scaffold creates C1/C2 folders; C3/C4 folders appear when their views exist. Multiple views of the same scope get independent filenames. The canonical DSL and synchronized JSON remain at the project root.

For older flat `views/*.md` or `studio/views/*.md` documents, enter editing and choose **Organize view folders**. With Auto-save enabled the move is persisted; otherwise review the new/deleted paths and rewritten links in **Review & save**, or Undo the draft. Original files are retained in `.omnidocs/history`. View IDs and scope IDs remain unchanged. Existing custom hierarchies, such as the supplied project's `01-c4-context/` and `02-c4-containers/`, remain supported and are not relocated.

## Delete items and canvas context menus

Right-click a card to inspect/edit it, open or expand its next level, add an item inside its child view, draw a connection, or delete it. Right-click an arrow to inspect/edit/delete that relationship. Right-click empty canvas space for Add item, Draw connection, Fit diagram and Clear focus. Menus stay within the viewport, support arrow keys/Home/End, and close with Escape or an outside click. Editable connected folders/local Spaces can enter editing directly through context actions; a portable snapshot must first connect its source folder.

Select an item and choose **Delete item**, press Delete/Backspace outside a text field, or choose **Delete item…** from its context menu. The confirmation lists affected item/relationship/view counts and any owned children. Confirming removes the item, its descendants (when present), attached relationships and scoped views, plus their owned source documents. Surviving native view membership, boundaries, entry paths, flows and bindings are cleaned. Structurizr declarations, exact include references, snapshot references and source digests update together. Ambiguous/dependent DSL constructs are refused without writing.

Auto-save persists confirmed deletion immediately with backups; manual mode keeps it in the draft until Review & save, and Undo restores that draft. The primary system owning the project's home view is protected so the workspace retains a valid entry point. Deleting arbitrary prose mentions, repository code and BPMN tasks is outside this action; entity-linked BPMN bindings are detached when their items are deleted.

## Flexible boundary frames

Cards can be dragged down/right past a frame's previous edge; the frame expands to contain them, including enclosing scopes when nested. Header and side padding prevent cards covering frame titles. Returning to a view preserves its manual positions and expanded frame dimensions in the current Studio session. Adding items keeps existing manual positions and places new cards into available space, expanding their frames as needed. Arrange rebuilds the automatic layout; coordinate and frame-size persistence to Markdown is not enabled.

## Foreground ordering for expanded scopes

Opening a system/container inline brings the expanded boundary and its entire subtree above overview cards. Nested component scopes appear above their container siblings. Clicking/dragging a child promotes its expanded branch; selecting an unrelated overview item never lifts it over the open working area. Internal relationship lines sit above their view backgrounds, while overview links stay behind expanded boundaries. Parent growth preserves this ordering. Closing a scope returns the card to ordinary overview ordering. These are visual canvas properties; they do not alter the architecture documents.
