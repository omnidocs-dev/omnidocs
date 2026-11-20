# OmniDocs Studio

A local application explorer and visual editor driven by a folder of Markdown documents. Built with React, TypeScript, React Flow, ELK.js, and bpmn-js.

## Run

Requires Node.js 22.14+ and npm.

```sh
npm install
npm run studio
```

Open http://127.0.0.1:4174. On macOS you can also double-click `Start OmniDocs.command`. The launcher stays open while the app runs; stop with Ctrl+C. For development with separate React and API processes, use `npm run dev` and open http://127.0.0.1:5173.

Choose **Spaces → New space**, enter a name and purpose, and create your application. Each space gets its own folder under `projects/`, with a canonical Structurizr DSL in Markdown, synchronized JSON snapshot, and derived view documents. The selected space is remembered in this browser.

Choose **Edit workspace**. Auto-save is on for local server spaces: submitting **Save to Markdown**, drawing and submitting a connection, or deleting a connection writes the files immediately with backups. Select any old or new item and choose **Edit selected** to update it. **Open next level** opens its existing view; **Create next level** adds a C2/C3 view for a system/container. Use **Add item → View / level** to choose the exact diagram, including one expanded inside the current canvas. Disable Auto-save to stage several changes and use **Review & save**. Finish editing before switching spaces.

**Full canvas:** the corners button next to the layer switcher expands the canvas to the entire application viewport. Headers and side panels return when you exit with the same button or Esc. Resizing preserves diagram zoom and its focal point; Fit diagram to canvas is a separate control that changes zoom. The protocol legend collapses to a floating overlay in full-canvas mode, and BPMN retains its zoom too.

**Manual data flow:** choose Edit workspace → New manual data flow, enter a name/description, and create an empty canvas with three bands. Use Add item in L1, L2 or L3 to pick existing model elements of that level, then Draw connection and drag between their ports. Adding items does not import existing relationships. The Markdown view is saved under `views/data-flows/workspace/`; Structurizr projects use it as an OmniDocs companion view referring to canonical model IDs. Drawn connections are shared architecture relationships, saved to the same canonical source and snapshot. The bands express abstraction, not ownership, and do not expand inline. When a band grows wider, later bands shift right with an 80-unit minimum gap; local item positions are retained and the corrected geometry is saved. Create new architecture elements in their C4 views before adding their references to the flow. No path, sample or runtime sequence is inferred.

**Ownership context in C2/C3:** standalone views derive nested system/container boundaries from the model’s parent links. Components stay inside their owning container, sibling containers stay inside the owning system, and external systems/people stay outside it in a dotted context envelope. Cards show their L1/L2/L3/L4 abstraction. Document-defined groups are preserved under their common owner. Open inline details reuse visible supporting items and lift missing supporting items to the appropriate surrounding context. Frames grow with node movement and their geometry is saved in the existing layout metadata; canonical ownership and documents are unchanged.

**Add existing item** reuses model elements in another view without duplicating or moving them. Choose Edit workspace → Add existing item, select the target view, search/select one or more items, and save. Existing relationships whose endpoints are visible appear too. The picker filters items by C4 level and scope. Right-click an expandable system/container → Add existing item inside targets its child view. You can then draw a connection to the reused item, including an external system already visible beside an expanded scope. Native Markdown view lists and verified Structurizr DSL/snapshot sources are updated through the normal save/backup flow. Views with explicit DSL exclude rules need those rules adjusted in source first.

**Group selection:** drag a rectangle on empty canvas space to select enclosed boxes, then drag a selected box or the selection frame to move them together. Shift/Ctrl/Cmd-click adds to the selection; Esc clears it. Hold Space and drag, or use the middle mouse button, to pan. Inside an expanded scope, drag empty interior space to select its items; drag the scope heading to move the scope itself. Group moves save through the same layout persistence as individual moves.

**Arrange** offers connection-based horizontal/vertical flow, a single row, a single column, and a related grid, with three spacing choices. Arrangement and manual node moves save to `studio/layout.md` in the connected project, including positions, frame sizes, viewport, and chosen connection points. Reopening the same folder restores each view’s saved layout, including inline expanded scopes when reopened. This presentation metadata does not alter the canonical C4 model. With Auto-save disabled, layout changes join the draft and require **Review & save**. A read-only snapshot keeps layout only for the session until its project folder is connected. Each card has three connection points per side; they appear on hover while editing and during connection drawing.


Spaces are folders, without a database or application backend integration. The local document service handles filesystem writes; the React UI remains separate. `spacesRoot` in `omnidocs.config.json` or `OMNIDOCS_SPACES_DIR` changes the catalog directory. Only immediate supported Markdown workspace folders are listed. The portable HTML remains a snapshot with manual folder write permission; creating spaces requires the local server.


Select a local workspace with `documentRoot` in `omnidocs.config.json` or set `OMNIDOCS_DIR`. Without local configuration, the editor opens the fictional Orbit Commerce workspace in `docs/demo`.

```sh
OMNIDOCS_DIR=/absolute/path/to/your/documents npm run dev
```

You can also use **Open folder** to connect a document folder directly in a supporting desktop browser. The folder is selected once with read/write access; reads, Auto-save and Review & save use that same directory until you change the folder or reload the page. Browsers without write handles open a read-only snapshot. No files are uploaded. Only Markdown files are used. Inputs can use OmniDocs frontmatter or a supported Structurizr JSON export inside Markdown; ordinary documents in a Structurizr workspace remain readable. See [the format guide](docs/FORMAT.md).

When opening an empty folder, Studio shows the proposed files and asks for the project name/purpose. **Confirm · Create these files** initializes C1/C2 documentation in that folder; Cancel writes nothing. Existing Markdown folders are validated and loaded when compatible. The report lists the supported format, document/element/view counts, source integrity notes and editing availability. Unsupported folders show actionable errors and preserve the previously open project. A folder containing other files but no Markdown is left untouched.

## Portable preview

Open `output/OmniDocs-Studio.html` directly in a browser. It contains the application, fonts, and a snapshot of the configured Markdown workspace in one file. Open folder also works in this preview. It does not connect to the local document service or watch file changes.

Run `npm run build:portable` to generate a portable HTML file with the fictional workspace. To export your complete local Markdown workspace, run `npm run build:portable -- --include-configured-workspace` and set `OMNIDOCS_OUTPUT` to a separate destination. Packaging validates references and any declared DSL digest before writing the HTML.

## Explore

- Zoom/pan the canvas, move nodes, use the minimap, and fit the view.
- Single-click an element to focus it and its direct connections; click the background or press Escape to clear focus. Double-click Commerce Platform to expand its containers inside the current context diagram; double-click Backend API inside that boundary to see components. Collapse closes only that box.
- Use the canvas Layers icon to switch the entire diagram to a standalone C4 level. Explicit full-view navigation clears inline expansions.
- Click leaf elements for Markdown documentation, source, and incoming/outgoing relationships. Code elements open declared file/symbol mappings; Backend and Frontend repositories are grouped separately with independent refs.
- The demo includes Backend checkout and Frontend checkout code views at C4 level 4. Its repository URLs and paths are fictional; repository contents are not fetched or verified.
- Click arrows to inspect direction, protocol, communication mode, description, and documented payload. Protocol colors distinguish REST, gRPC, TCP, WebSocket, messaging, and database connections; solid/dashed lines distinguish direct and brokered paths. Open Connection legend for the complete key.
- Production deployment includes permanent Markdown-defined boundary frames, marked data entry, selectable numbered input paths, and a Fit path control. Separate cluster internals, application workloads, and stateful-services views support inline expansion. The fictional example documents worker nodes, ingress, Services, Pod replica counts, PostgreSQL replication, RabbitMQ, monitoring, and off-cluster backups.
- Switch to Order checkout for an ordered data-flow view.
- Open Production deployment for an illustrative host connection view.
- Open Checkout process for BPMN; linked tasks open their architecture entities.
- Use breadcrumbs, sidebar views, model search (`Cmd/Ctrl+K`), and the file browser.
- Edit local Markdown files in your editor to refresh the model automatically.
- Export the compiled model as JSON.

## Checks and production

```sh
npm test
npm run build
npm start
```

`npm start` serves the built UI and document API at http://127.0.0.1:4174. It requires the `dist` output from the build and the original Markdown folder.

## Current scope

This is a working viewer with separate OmniDocs-frontmatter and Structurizr-JSON adapters, not a parser for arbitrary prose. The YAML schema is a local OmniDocs convention, not a C4 interchange standard. One entity/relationship model feeds all architecture views; there is no separate editable diagram copy.

Architecture editing is supported locally; authenticated sharing and permission-checked team editing are available in service mode. Live collaborative merging, application telemetry, process execution, automatic source-code discovery, and automatic prose-to-model extraction are not included. Native OmniDocs code views and explicit repository mappings are supported; the configured logistics source currently defines only context/container views. Deployment views currently show hosts and connections; replicas and explicit container-instance placement are not implemented. BPMN requires complete XML with diagram interchange layout. Large workspace performance has not been benchmarked.

Local mode binds to `127.0.0.1` and provides local workspace read/write endpoints. It skips hidden entries, `node_modules`, and symlinks while loading documents. Use the separate authenticated service mode for hosted accounts; do not expose the local mode publicly.

## Input compatibility

The renderer is project-independent; the included Commerce/Kubernetes topology is demo data. The current Markdown parser accepts OmniDocs frontmatter and supported Structurizr JSON workspaces. Direct DSL compilation, Mermaid C4 parsing, and unsupported Structurizr view families are not implemented. See [Structurizr import](docs/STRUCTURIZR-IMPORT.md) for freshness checks and supported scope. See [the input contract](docs/INPUT-CONTRACT.md) for the distinction and current interoperability decision.

## Loaded logistics workspace

The current folder contributes 38 Markdown documents, 31 shared elements, 55 relationships, and two authored views. The context view contains 15 elements/16 relationships and the container view 30 elements/39 relationships. Levels 3/4, deployment, BPMN, and code repositories are not invented for this source. Source inspection notes are displayed separately from viewer validation. Use Workspace documents to read the README, guides, decisions, and other authored notes with relative-link navigation.

The Explore examples above describe the optional `docs/demo` fixture; select it with `OMNIDOCS_DIR=docs/demo npm run dev`.

## Visual editing

Choose **Edit workspace** to add or edit items and directed connections, preview the draft, then **Review & save** to write Markdown with backups and conflict checks. The backend and portable browser folder writer are separate persistence adapters. See [editing and persistence](docs/EDITING.md) for supported source formats, setup, and Structurizr validation limits.


## Hosted accounts and team spaces

Run `npm ci` once, then `npm run service:local` for personal use with SQLite and no Docker. On macOS you can also double-click `Start OmniDocs Service.command`. The launcher prints a generated administrator login and a personal user login when creating them. Save the passwords, which are shown once. For production, the same account, workspace and editor features run in Docker Compose with PostgreSQL and the configured HTTPS and email delivery. See [service setup and deployment](docs/SERVICE.md).

Keep private workspaces in `projects/` or keep service data under `.service-data/`. Git and Docker exclude these paths along with backups and local configuration. If you use a different workspace directory inside the checkout, add its path to `.git/info/exclude` and `.dockerignore` before publishing. `npm test` uses the versioned demo and synthetic fixtures. Tests that load private workspaces belong under `tests/private/` and can be run locally with `node --import tsx --test tests/private/*.test.ts`.
