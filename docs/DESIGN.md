# OmniDocs visual system

Reference: [Zenzap](https://www.zenzap.co/), inspected live on November 13, 2026. This is a reference-led OmniDocs adaptation, not an official Zenzap UI kit. OmniDocs keeps its own identity, content, architecture semantics, and interaction model.

## Observed reference primitives

| Role | Value |
| --- | --- |
| Typeface | Figtree, variable weight 100–900 |
| Amber | `#FFC35F` |
| Main text | `#111111` |
| Supporting text | `#666666` |
| Warm page surface | `#FEFCFB` |
| Warm secondary surface | `#F8F2E9` |
| Charcoal | `#1D1C1A` |

The reference combines rounded pill controls, medium-weight geometric headings, amber calls to action, and generous light surfaces. OmniDocs adapts these for a dense architecture workspace rather than reproducing the marketing-page layout.

## Application rules

- CSS tokens in `src/styles.css` define the palette, diagram colors, and radii. React Flow reads diagram colors from those same CSS properties.
- The charcoal header and in-scope system cards anchor the workspace. Amber identifies actions, selected navigation, drill-down footers, and linked BPMN tasks.
- Supporting cards use white/warm surfaces with neutral borders. External systems and people retain dashed borders; explicit type labels remain visible.
- Amber surfaces use dark text. Links and focused outlines use a darker amber ink for contrast on light backgrounds.
- Controls use pill radii; panels and diagram cards use 18px and 16px radii. Responsive spacing and reduced-motion behavior are retained.
- Figtree is bundled locally with its SIL Open Font License in `src/assets/fonts/OFL.txt`; the running application makes no font request to Zenzap or Google Fonts.

## Relationship motion

Architecture, deployment, and data-flow connections carry two protocol-colored markers along the same SVG path used by the arrow. Motion progresses from the source endpoint to the target, including reverse-facing connections. BPMN sequence/message flows retain amber markers with their own process notation. Undirected associations are left unanimated.

Markers do not intercept pointer events, so arrow and BPMN task selection remain available. They illustrate documented direction rather than live traffic or process execution. The system reduced-motion preference hides the moving markers while retaining static connections and arrowheads.

The canvas layer control uses a four-plane icon: top-to-bottom corresponds to C4 levels 1–4. Only the current level is amber. Complementary/custom views do not highlight an unrelated C4 plane. A brief color transition follows navigation and respects reduced motion.

## Inline architecture expansion

Clicking an element with a child view expands that box into an amber scope boundary on the same React Flow canvas. The surrounding level, page heading, breadcrumbs, and layer badge remain unchanged. Its child diagram is laid out inside the boundary; further child boxes can also expand. Outer arrows still attach to the original scope, while inner arrows connect the documented child elements. Repeated entities in different scopes have separate visual instances linked to the same source documentation.

The camera eases over 480 ms to frame the enlarged diagram. Scope boundaries unfold and child cards fade into view. Collapse removes that boundary's descendants, restores the card, and returns to its previous zoom/pan when the canvas size matches. The reduced-motion preference disables the reveal and camera animation.

The Layers icon changes the entire canvas level and clears inline expansions, including when selecting the current level. Explorer, breadcrumbs, and explicit full-view links also open standalone diagrams. No expansion is written back to Markdown.

Expanded scopes use a fixed color for the child level, independent of which view is the canvas root: L2 warm amber (`#FFF1D7`), L3 sage (`#E3F1EC`), and L4 blue (`#E7EDF9`). Each has a coordinated stronger header and border; the minimap uses the same background. Explicit L2/L3/L4 labels remain visible so color is not the only distinction. CSS scope tokens define the palette centrally.

## Readability pass

UI font sizes are 2 px larger across navigation, panels, controls, and supporting labels. Document body text is 14 px; inspector descriptions and navigation labels are 13 px. Diagram card titles are 18 px and descriptions/arrow labels are 13 px. Cards have 274×246 px layout space, and expanded scopes reserve 100 px for their title/description area. Menu rows grow and wrap as needed.

Deployment entities can expand scoped deployment views using the same compound canvas. Their headers say Infrastructure rather than numbered C4 levels; amber/green/blue differentiate nesting depth for these complementary diagrams.

## Deployment frames and input routes

Permanent dashed frames label document-defined boundaries and categories. They are separate from solid expandable entity scopes: a frame groups existing entities and nested frames without becoming an application component. Their names, membership, parent boundaries, category labels, and amber/sage/blue/neutral tones come from the view metadata. The bundled overview groups public input, Kubernetes, ingress, application/data namespaces, platform operations, and external dependencies.

Input points display a Data entry badge. The first document-defined route is highlighted with numbered, thicker arrows; the input toolbar switches routes or restores all connections without changing layout or camera. Fit path frames only the selected route's entity endpoints. Existing arrow motion and documentation selection remain available.

## Protocol and communication key

`shared/communication.ts` supplies one protocol palette for strokes, arrowheads, directional particles, and the visible connection key. REST is blue, gRPC violet, WebSocket teal, TCP slate, AMQP rose, SQL green, and other supported protocols have their own keyed colors. Type/technology labels remain present, so protocol meaning is not communicated by color alone.

Direct network traffic uses solid lines, brokered messaging dashed lines, and configuration projection dotted lines. These are independent of protocol color. Selection and input-path highlighting retain the original protocol color and use width/opacity for emphasis. Parallel links receive distinct rounded channels with labels placed on those channels. The desktop key starts open; the mobile key is expandable within the canvas. An open key reserves space below the diagram instead of covering it; closing it restores the full drawing area. Viewport caching uses the actual React Flow dimensions. BPMN retains its own process notation.

## Architecture-to-code traceability

The inspector keeps Docs, Relations, Code, and MD as separate tabs. Code elements open their Code mappings directly; other mapped elements expose a Linked code action in their documentation. Backend, Frontend, and Shared sections derive from each explicitly referenced repository's area. Each card shows its own repository, provider, relative file/directory path, effective ref, optional symbol, and line hints. Link construction is local and does not fetch repository content.

The sample uses separate fictional Backend and Frontend repositories and distinct refs, with selected code elements under the Backend Checkout Handler and Frontend Checkout Page. Code-level navigation stays within the selected/current container ancestry. No path-name heuristics or automatic cross-repository associations are used.

## OmniDocs brand mark

The custom vector mark combines a folded document outline with three connected architecture nodes. Amber `#FFC35F` and charcoal `#1D1C1A` match the workspace palette. The canonical 64-unit SVG is `src/assets/brand/omnidocs-mark.svg`; it replaces the generic header glyph, the lower rail brand stamp, and the empty-state illustration. The same source supplies the favicon. Functional layer/architecture icons remain distinct from the brand mark.

The header renders the mark at 36 px on desktop and 32 px on mobile. Standalone HTML embeds both its image and favicon as data URIs. A 1024×1024 PNG export and a light/dark size-preview board are available under output.
