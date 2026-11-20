# Prototype verification

## Automated checks

- `npm test`: 8 passing tests covering Markdown parsing, malformed sources, duplicate identifiers, missing references, hierarchy cycles, C4 context scope, BPMN entity bindings, flow ordering, and the actual demo documents.
- `npm run build`: TypeScript checking and production Vite build passed.
- `npm run build:portable`: TypeScript checking and single-file preview generation passed.
- Build reports a large main JavaScript chunk, primarily the diagram/layout libraries. Large-document performance has not been benchmarked.

## Browser checks

The browser could not reach the local loopback service. Browser verification used the compiled portable application with its real bundled Markdown snapshot; the parser, canvas, and UI were not replaced with mocks.

Observed successfully:

- Context, container, and component views; clicking the system and API drilled into the next C4 level.
- C4 views sorted from Level 1 through Level 3.
- All five context nodes fit within the initial desktop canvas after measured-node initialization.
- Clicking the checkout request arrow displayed its source, target, protocol, and payload fields.
- Production deployment rendered its three documented hosts.
- The BPMN XML rendered through bpmn-js; clicking Authorize payment opened Payment Adapter documentation.
- Model search filtered the real entity set.
- The folder-import handler loaded 25 Markdown files through browser File/DataTransfer objects; changed project metadata appeared in the UI.
- Invalid imported Markdown produced file-specific errors and retained the last valid workspace.
- At an emulated 390px mobile viewport, the explorer/details overlays were initially closed and the document had no horizontal overflow.
- No browser console errors or warnings were observed during the checked desktop journeys.

The native operating-system folder picker, live server API integration, and SSE refresh were not verified end to end. The folder test exercised the real import handler with generated File objects instead of an OS picker. Fit-to-view was exercised through the UI controls. Free dragging, pinch zoom, and viewport retention were not exhaustively tested. No cross-browser or large-model testing occurred.

## C4 review scope

Reviewed against the official C4 notation and diagram checklist: named view/type/scope, explicit entity types and responsibilities, directed labeled relationships, container/component technology, and a visual legend. Context contains people and software systems; deployment/data-flow/BPMN are complementary views.

The accepted Markdown frontmatter is an OmniDocs project convention. No Structurizr parser or validator was run, and this is not a claim of C4 schema certification. Orbit Commerce is a fictional example, not an analysis of the user's application.

## Zenzap theme and relationship motion pass

- Inspected Zenzap's current page, computed typography/colors, stylesheet font definition, and screenshot. Applied Figtree, amber `#FFC35F`, charcoal, warm off-white surfaces, and pill controls as an OmniDocs adaptation.
- Bundled the Figtree font and SIL license locally; browser font readiness confirmed successful loading in the portable artifact.
- Production and portable builds passed after the theme and animated-edge changes.
- Opened the actual generated portable HTML file in the browser. No console errors or warnings appeared during the checked diagram journeys.
- Confirmed five context connections render ten moving markers; each motion path exactly matches its visible arrow path.
- Sampled marker positions across 350 ms. Progress increased along all five source-to-target paths, including the right-to-left email/customer relationship.
- Clicking an animated relationship still opened its details.
- BPMN rendered ten markers on its five sequence flows; all motion paths matched their connection paths. Linked tasks retained the amber highlight.
- Emulated reduced motion: all five motion groups were hidden, preserving the static diagram.
- Checked a 390px mobile viewport after the theme update: document width matched the viewport, with no horizontal overflow.

## Responsive canvas correction

- Reproduced the reported problem in the existing standalone HTML without reloading: increasing the viewport from 1440px to 2100px left the diagram approximately 299px left of the canvas center. The page itself filled the viewport, but the saved diagram transform stayed fixed.
- React Flow now observes its actual canvas width/height and refits on size changes, including panel opening/closing. Saved zoom/pan is restored only when revisiting a canvas of the same size; node positions remain retained.
- BPMN observes its container size, invalidates the cached viewbox, and refits after resizing. The observer and pending animation frame are cleaned up when changing views.
- In the rebuilt portable HTML, tested 1440×1000 → 2100×1000 → 1200×800 → 390×844 in the same browser document. All C4 nodes remained inside the canvas, horizontal center error stayed within 1px, and the document had no horizontal overflow.
- Closing and reopening the inspector at 2100px changed the canvas width from 1378px to 1728px and back; both layouts stayed centered.
- A manual zoom followed by container/context navigation at unchanged canvas size restored the exact prior viewport transform.
- BPMN remained inside its resized container at 1200px, 2100px, and 390px, with automatic scale/position changes.
- No browser console errors or warnings were observed during these checks. Production and portable builds passed.

## Canvas layer selector

- Added a canvas-local Layers icon with current-level badge, existing/missing level states, and multiple-view selection. It uses the application's existing navigation and viewport cache.
- Added system-scoped navigation resolution and optional `navigationLevel: 5` metadata for complementary custom perspectives. C4 views cannot be relabeled as level 5.
- `npm test`: all 15 tests passed, including system isolation, upward navigation from code views, selected-branch preference, missing levels, complementary-view navigation, and custom-level validation.
- In the actual rebuilt portable HTML, used the control to switch L1 → L2 → L3 → L1; verified titles, current badge, and automatic menu closure.
- Escape closed the popup and returned focus to its trigger; outside pointer interaction also closed it.
- Imported a browser-only Markdown fixture with a second component view and explicit custom-level deployment view. The selector listed both component branches, navigated to the chosen worker branch, enabled custom level 5, and opened the configured deployment view. Restored the unmodified bundled demo after testing.
- At 390px, the popup stayed inside the canvas and the document had no horizontal overflow. No browser console errors or warnings were observed.
- Production and portable builds passed. The shipped example has no code or custom-level document configured, so levels 4 and 5 are disabled until supplied in Markdown.

## Four-plane C4 icon

- Replaced the generic stack glyph with four distinct overlapping planes, numbered from top (1) to bottom (4).
- The current C4 level alone receives the amber fill; inactive planes remain warm neutral. The visible level badge and accessible current-level description stay synchronized.
- Verified actual browser navigation through levels 1, 2, 3, and 4, using a temporary imported code-view fixture for level 4. Each state retained exactly four planes and exactly one matching amber plane. Restored the unchanged bundled example afterward.
- Production and portable builds passed, with no browser console errors/warnings during the checked sequence. The existing layer selection/navigation logic was retained.

## Earlier animated drill-down pass (superseded by inline expansion)

- Removed the view-ID remount of React Flow. In the rebuilt standalone HTML, sampled the camera every 100 ms through context → containers; observed focus, reveal, and idle phases with intermediate camera transforms. The exact same `.react-flow` DOM element and document time origin remained throughout; five parent nodes became eight child nodes.
- Checked containers → API components and visually inspected the expanding amber boundary and child reveal. Returning to context restored the exact pre-animation viewport transform.
- Interrupted both the focus phase and the child reveal through sidebar navigation. Each settled on the requested diagram with no remaining input guard.
- Emulated reduced motion: navigation reached eight container nodes without an expansion shell or animated transition, preserving the same canvas.
- At 390×844, checked context → containers → components. Both drill-downs completed and document width stayed equal to viewport width.
- All 15 existing model/navigation tests passed. Production and standalone builds passed. No console errors/warnings appeared in the checked browser journeys. This pass used the bundled example in Chrome; cross-browser and large-model behavior remain unverified.

## Inline compound diagrams

- Replaced node-click full-view navigation with nested React Flow parent/child nodes. The existing Layers control still selects full diagrams; explicit navigation clears inline expansions even when selecting the current level.
- In the actual portable HTML, expanded Commerce Platform in context: the title and L1 badge stayed unchanged, all five context nodes remained, eight child nodes appeared, and the same canvas DOM element and document remained mounted. Visually reviewed the amber boundary and surrounding arrows.
- Expanded the nested Backend API: six component nodes appeared in its own inner boundary while the context remained L1. Collapsing API retained the system boundary; collapsing the system returned to five nodes and the exact initial viewport transform.
- Used the Layers icon to open standalone L2: exactly eight root nodes and no inline boundary remained. Expanded API and reselected L2; inline expansion cleared again.
- Nested leaf clicks opened the original entity documentation, nested arrow clicks selected the original relation, and directional motion paths remained present.
- Added three layout tests: preservation of outer context/relationships, unique visual occurrences of shared entities, recursive containment and endpoint resolution, standalone/collapsed isolation, and cache/ID collision prevention. All 18 tests passed. Production and portable builds passed.
- At 390×844, expansion produced 13 nodes and one boundary while remaining at L1, with no horizontal document overflow. With reduced motion, the boundary animation computed to `none` and the camera immediately reached its final transform. Resizing the expanded diagram from 1440px to 2100px kept all 13 nodes inside the canvas with center error below 1px. No console warnings/errors appeared during the checked journeys.
- Verification uses the bundled fictional example in Chrome. Cross-browser and large-model behavior remain unverified.

## Distinct expanded-level backgrounds

- Added level-specific background, heading, and border colors for expanded L2/L3/L4 scopes, with matching minimap fills. Selected scopes retain their own level border.
- In the rebuilt portable HTML, imported a temporary browser-only code-view fixture and expanded context → containers → components → code inline. Computed backgrounds were respectively `rgb(255, 241, 215)`, `rgb(227, 241, 236)`, and `rgb(231, 237, 249)`, with distinct matching headers/borders; the root stayed L1. Visually reviewed the nested colors, then restored the unchanged bundled example.
- Production and portable builds passed. No console warnings/errors appeared in the checked journey. This was a visual styling change; the layout/model tests were not rerun.

## Larger typography and Kubernetes production example

- Increased interface font sizes by 2 px, including navigation, inspector text, metadata, modal copy, and canvas controls. Diagram titles are now 18 px and descriptions/arrow labels 13 px. Enlarged card geometry and scope-header layout space; menu rows can wrap.
- In the actual portable HTML at 1440×1000, confirmed 13 px navigation and inspector descriptions, 14 px document body, and 18/13 px card titles/descriptions. Context and nested component cards had no measured content overflow. At 390×844, the inspector remained within its overlay and document width stayed 390 px.
- Expanded the fictional production example to 37 entities, 9 views, and 47 Markdown documents. It contains a production overview and three scoped deployment subviews: Cluster internals, Application workloads, and Stateful services. All source remains canonical Markdown; no Kubernetes resources are provisioned.
- Reviewed against the official C4 deployment/notation/checklist pages and Kubernetes architecture, Deployment, Service, and persistent-volume documentation. This uses the accepted OmniDocs schema and does not claim official DSL certification. Namespace/resource grouping, replica counts, protocol direction, logical-container mappings, and backup/failover assumptions are documented explicitly.
- Added deployment-only child-view resolution. Verified that ordinary commerce/API nodes still resolve their original C4 children. Deployment headers use Infrastructure, not fabricated C4 levels, and nesting colors/minimap fills remain distinct.
- In Chrome, opened Production deployment (six root nodes), then expanded the cluster and both namespaces to 24 nodes and three boundaries on the same canvas. No card content overflow or layout error appeared. Selecting API Pods opened their Markdown details; selecting the PostgreSQL Service arrow opened its original relation. All 24 edges retained two directional markers.
- Added a production graph test covering scoped expansion, boundary retention, endpoint integrity, and child containment. All 19 tests passed; production and portable builds passed. No browser console warnings/errors appeared during the checked desktop journey. Cross-browser and live infrastructure verification were outside this sample-documentation task.

- At 390×844, opened Production deployment and expanded the cluster plus stateful-services namespace: 18 nodes and two boundaries rendered, the root remained Production deployment, and document width equaled the viewport with no layout error.

## Project-independent input audit

- Searched rendering/layout/model/API code for demo entity names and IDs. No Commerce/Kubernetes names or IDs controlled parsing, scope resolution, layout, or drawing; the only UI text hit was the guide identifying the fictional bundled example.
- Added independent Research Archive and Civic Planner Markdown fixtures with unrelated names/IDs, all four C4 levels, directed dependencies, and VM-hosted deployment expansion. Both passed through the same compiler, navigation resolver, and layout engine.
- All 21 tests passed and TypeScript checking passed. The actual portable HTML imported the Research Archive folder through its existing file handler and rendered nested L2/L3/L4 scopes while retaining the L1 root. Source node IDs all belonged to the new workspace. Restored the bundled example after checking.
- Documented the existing OmniDocs frontmatter syntax separately from C4 semantics and from unimplemented Structurizr/Mermaid input support in INPUT-CONTRACT.md. The standard input syntax choice remains open; no new parser support is claimed by these tests.

## Document-defined deployment boundaries and input routes

- Added generic view boundary/entry-point/flow metadata to the existing OmniDocs input adapter, with file-specific validation for boundary cycles/missing parents, duplicate node membership/IDs, out-of-view entries/routes, and repeated route references. These are product input fields, not a claim of Structurizr/Mermaid parsing support.
- Layout produces distinct frame objects instead of fake entities. Hierarchical frames and expanded child scopes coexist; original relation endpoints remain entity IDs even across frame boundaries. Parent-before-child rendering and containment were tested.
- The production overview now declares 21 entity cards inside seven permanent frames and 23 direct connections. Its six-step checkout route and seven-step order-event route follow explicit Markdown relationship lists. More detailed standalone deployment views remain available.
- Added validation and arbitrary-project boundary tests. All 23 tests passed, covering C4 navigation, deployment expansion, non-Kubernetes project independence, nested boundaries, preserved cross-frame endpoints, and invalid-input diagnostics.
- In the actual rebuilt HTML at 1440×1000, verified seven named frames and the marked HTTPS entry. Switched checkout → order events (six → seven numbered highlighted edges), confirmed the camera stayed unchanged, used Fit path to change the viewport, then restored all 23 connections with no muted edges. Entity documentation selection retained the original API Pod document, and the same React Flow DOM element remained mounted.
- Imported a separate Research Archive VM fixture with University network / Catalog compute / Archive storage frames and an Archive write route. Frames, original relationship selection/numbering, and an inline process expansion rendered without application-specific code or layout errors. Restored the bundled example.
- At 390×844, the production frames and route toolbar remained within the canvas/document width, with six highlighted checkout edges and no layout error. No console warnings/errors appeared in the checked desktop journeys. Production and portable builds passed; cross-browser and large-model performance remain unverified.

## Protocol colors, broker paths, parallel channels and visible key

- Added optional structured relationship communication protocol/mode fields while retaining free-text protocol labels. One shared palette supplies path, arrowhead, animated-marker, and legend colors. Explicit metadata takes priority; HTTP/JSON is not guessed as REST and an unspecified queue protocol is not guessed as AMQP.
- Direct network links are solid, brokered links dashed, and config projection dotted. Route/selection emphasis preserves protocol colors. Parallel links between the same visual endpoint pair have separate rounded channels without changing their source or target.
- Added four tests for protocol recognition/override precedence, unknown/queue fallback, palette and line patterns, and finite distinct parallel paths in horizontal/vertical/reverse layouts. All 27 tests passed. Production and portable builds passed.
- The fictional deployment example now has 30 connections, including documented REST, gRPC, WebSocket, direct TCP reachability checks, SQL, HTTP and AMQP. Its static source remains Markdown; replica/card counts stay unchanged.
- In the actual rebuilt standalone HTML at 1440×1000, verified nine protocol categories in the rendered graph and all 12 palette entries in the open key. The three API Service → Pod REST/gRPC/WebSocket connections had different SVG paths. All moving-marker paths exactly matched their drawn arrow paths, including parallel channels. AMQP lines were dashed and their marker colors matched their strokes.
- Switched input routes and selected a gRPC arrow: all stroke colors were preserved, the selected edge grew to 3.6 px, and the inspector showed gRPC / HTTP2 :9090 with Direct link mode. Compared every drawn stroke color with the shared legend swatches.
- Opening the key reserves a separate region below the diagram. Verified no overlap in desktop and 390×844 mobile layouts; the mobile key starts collapsed, stays inside the canvas when opened, and document width remains 390 px. Manually zoomed Production, visited Containers, and returned: the exact prior transform was restored with the open key.
- With reduced motion, all marker groups were hidden while protocol colors remained. Existing data-flow numbering and BPMN rendering were checked. No console errors/warnings appeared during the checked journeys. Cross-browser and large-model behavior remain unverified.

## Separate Backend/Frontend code mapping

- Added optional project repositories with explicit Backend/Frontend/Shared area, GitHub/GitLab provider, web URL, and default ref. Entity code mappings declare their repository ID and normalized relative file/directory path, with optional symbol, per-link ref, and ordered line hints. Existing workspaces default to empty code metadata.
- Added file-specific validation for missing/duplicate repository references, unsafe or malformed repository URLs, invalid paths, empty refs, and inconsistent line/directory targets. Mapping resolution never falls back to another repository and does not fetch or verify remote content.
- Added provider-aware file/directory URL construction with encoded refs/path segments and correct GitHub/GitLab line anchors. Tests cover independent Backend/Frontend versions, override behavior, symbols, directory/root paths, escaped filenames, and invalid input.
- Added component-to-code examples for Backend checkout and Frontend checkout, plus explicit Frontend component dependencies. The sample now contains 43 entities, 12 views, and 56 Markdown files. The example URLs, refs, paths, symbols, and line numbers are fictional and labeled accordingly.
- Level-4 navigation now filters code views to the selected/current container ancestry. Added a regression test proving separate branches do not substitute each other's code view and a branch without a code view stays unavailable. All 32 tests passed. Production and portable builds passed.
- In the actual standalone HTML at 1440×1000, the system Code tab showed distinct Backend and Frontend repository sections. Selected Backend and Frontend code nodes: both opened Code automatically and produced different repository URLs and refs with their declared symbols and line ranges. Verified Frontend components → L4 opened Frontend checkout code and API components → L4 opened Backend checkout code.
- Expanded context → storefront → checkout page → code inline, selected the function, and confirmed the root stayed L1, the same React Flow canvas remained mounted, and the Code pane showed only the Frontend mapping.
- At 390×844, the Frontend code pane stayed inside the viewport, file text wrapped without card overflow, all four inspector tabs fit, and the document width stayed 390 px. No browser console warnings/errors appeared in the checked desktop journeys. Remote links were inspected structurally, not opened against the fictional repositories. No source-code or symbol analysis, live link verification, editor integration, or cross-browser validation is claimed.

## Custom OmniDocs mark and favicon

- Created a code-native SVG document/network mark and applied it to the header, lower rail stamp, empty state, and browser favicon. Updated the browser theme color to the existing charcoal token value.
- Production and portable builds passed. The normal build emits the SVG asset and references it from the HTML favicon and application bundle.
- Browser inspection caught an external asset reference in the initial standalone image import. Updated the portable packager to embed emitted assets referenced by JavaScript as well as CSS. Rebuilt the actual file and confirmed the header image, rail image, and favicon all decoded successfully from embedded SVG data URIs.
- At 1440×1000 the mark rendered at 36×36; at 390×844 it rendered at 32×32 and document width remained 390 px. Reviewed the mark on light/dark surfaces and in a small-size preview. Exported the same SVG to a 1024×1024 PNG with transparent rounded corners.
- This was a branding/asset-packaging pass. Model tests were not rerun; validation was production/portable builds and actual browser asset decoding/rendering.
