# OmniDocs Markdown format (v0.1)

For the native OmniDocs adapter, a workspace is a folder containing Markdown files with YAML frontmatter. The separate [Structurizr import adapter](STRUCTURIZR-IMPORT.md) also accepts an exported workspace JSON block plus ordinary Markdown documentation. OmniDocs recursively reads `.md` files. Every file in the selected folder must be a project, entity, or view document. Keep format guides and unrelated Markdown outside that folder.

This is an OmniDocs input format shared by all projects. It is not an official C4 serialization format or a universal Markdown architecture parser. Ordinary prose alone does not define an architecture graph. All views reference one shared set of entities and relationships. Project names, IDs, technologies, topology, replica counts, and diagram membership come from these files; the renderer does not require the bundled Commerce/Kubernetes example.

## Project document (exactly one)

```yaml
---
id: my-project
kind: project
name: My Application
description: A description of the workspace
home: system-context
---
```

`home` references an existing view ID. IDs are globally unique across project, entities, views, and relationships. Use letters, numbers, dots, hyphens, and underscores; begin with a letter or number.

## Entity document

```markdown
---
id: orders-api
kind: container
name: Orders API
description: Manages orders and checkout.
parent: commerce
technology: Go · HTTP
owner: Commerce team
tags: [Core service]
relationships:
  - id: orders-to-database
    target: orders-db
    label: Persists orders
    protocol: PostgreSQL / TLS
    description: Saves the order and its outbox event in one transaction.
    payload: [orderId, status, totalAmount]
---

# Orders API

## Responsibilities

Your detailed Markdown documentation goes here.
```

Required: `id`, `kind`, `name`, `description`. `technology` is required for container, component, database, and queue entities. Other fields are optional. A relationship is declared on its source entity; `target` references its destination. Each relationship requires `id`, `target`, and an informative directed `label`.

Entity kinds: `person`, `system` (in-scope software system), `external` (external software system), `container`, `database`, `queue`, `component`, `code`, `deployment`. Databases and queues are container specializations in this prototype. `parent` defines ownership in the logical hierarchy; it must not form cycles. Do not infer a separate runtime service from a domain/module name.

## View document

```yaml
---
id: containers
kind: view
name: Containers
type: container
description: Applications and data stores inside the platform.
scope: commerce
parentView: system-context
nodes: [storefront, orders-api, orders-db]
relationships: [web-to-orders, orders-to-database]
direction: RIGHT
---
```

Required: `id`, `kind: view`, `name`, `type`, `description`. Types: `context`, `container`, `component`, `code`, `dataflow`, `deployment`, `bpmn`. `nodes` explicitly chooses elements; omitted relationships include all defined relationships whose endpoints are in the view. An explicit list chooses and orders the relationships. Both endpoints of every selected relationship must be present.

`scope` references the entity described by the view. Single-clicking an entity focuses its visible occurrence and incoming/outgoing connections while fading unrelated items. Click the canvas background, Clear focus, or press Escape to clear focus. Double-clicking an entity expands a container, component, or code view with that scope inside the current diagram; the first matching view is used if several match. Child diagrams can be expanded recursively, and Collapse removes that boundary and its descendants. The canvas Layers control opens the selected level as a complete standalone diagram and clears inline expansions. A deployment entity can similarly expand a deployment view scoped to its ID. This uses nested infrastructure boundaries, not C4 level numbers. Other entities open their details. `parentView` defines breadcrumbs, and `direction` is `RIGHT` (default) or `DOWN`. Data flow step numbers follow the explicit relationship order; this is a documented journey, not runtime tracing or executable flow control.

A context view must include its in-scope `system` and contain only people/software systems. Internal applications and stores belong in container views. Components belong to one container. Deployment/data flow/BPMN views are complementary perspectives, not additional C4 levels. Logical containment and deployment instances are not interchangeable: the current deployment view represents deployment hosts and their documented connections, without automatic instance mapping or replicas.

## BPMN view

```markdown
---
id: checkout-process
kind: view
name: Checkout process
type: bpmn
description: The successful checkout path.
scope: commerce
bindings:
  Task_CreateOrder: orders-api
---

# Checkout process

Explain the process and its scope here.

\`\`\`bpmn
<?xml version="1.0" encoding="UTF-8"?>
<!-- Complete BPMN 2.0 XML including BPMNDI layout. See demo/views/checkout-process.md. -->
\`\`\`
```

Use actual triple backticks (without backslashes) around the XML. bpmn-js renders the first fenced `bpmn` block. Include BPMN diagram interchange (BPMNDI) shapes and edge waypoints, normally exported by a BPMN modeler. `bindings` maps BPMN element IDs to architecture entity IDs. Linked tasks are highlighted; clicking them opens the entity details. Viewing does not execute the process.

## Loading and updating

- Local folder: `omnidocs.config.json` → `documentRoot`; fallback `docs/demo`. Change with `OMNIDOCS_DIR=/absolute/path npm run dev`.
- Local service: automatic refresh when Markdown changes.
- Browser **Open folder**: initially grants read access to a snapshot; reopen to refresh. **Edit workspace** can save through an explicit browser folder-write grant. Imported data is not uploaded to the document service. See [editing and persistence](EDITING.md).
- Invalid imports retain the last valid workspace and show file-specific diagnostics. Fix the files and reopen. Local changes refresh automatically.
- Canvas positions and zoom are retained while switching views during this session. When the canvas size changes (window resizing or opening/closing panels), the diagram automatically refits and centers. Saved zoom/pan is restored only at the same canvas size. Layout is not saved to Markdown or persisted across reloads.
- Source is displayed as text; Markdown raw HTML is not executed.

## Canvas layer selector

The Layers icon at the top-right of the canvas switches between documented C4 views: context (1), container (2), component (3), and code (4). It remains available with the explorer/details panels closed and from complementary views such as BPMN. Navigation stays within the system containing the current view's scope. If several views exist at a level, the selector lists them, preferring the selected entity's branch.

Missing levels are disabled; OmniDocs does not invent diagrams or implementation details. The demo contains C4 levels 1–4, including separate Backend and Frontend code views. An undefined code view stays unavailable for that container branch.

For the requested custom level 5, add `navigationLevel: 5` to a complementary `dataflow`, `deployment`, or `bpmn` view. For example, a deployment view may include:

```yaml
id: production
kind: view
name: Production deployment
type: deployment
navigationLevel: 5
scope: commerce
nodes: [edge, runtime, data-node]
description: Production deployment hosts and connections.
```

This is a custom navigation slot, not an official fifth C4 level. C4 architecture views retain their own level and cannot be relabeled as custom level 5. The custom option remains disabled until a matching Markdown view exists. Multiple custom views are listed for selection.

## Deployment frames and input paths

The current OmniDocs input adapter supports optional, document-defined `boundaries`, `entryPoints`, and `flows` on a view. These are visualization metadata in this product's input contract, not an official C4 Markdown syntax. They are independent of project names and technologies. BPMN boundaries and flows belong in its BPMN XML instead.

```yaml
boundaries:
  - id: private-network
    name: Private network
    category: Network boundary
    description: Application and storage resources.
    tone: blue
    nodes: []
  - id: applications
    name: Application services
    category: Runtime group
    parent: private-network
    tone: sage
    nodes: [request-service]
  - id: persistence
    name: Data storage
    category: Storage group
    parent: private-network
    tone: blue
    nodes: [record-store]
entryPoints:
  - node: request-service
    label: Record input
flows:
  - id: record-write
    name: Save a record
    description: Input reaches durable storage.
    relationships: [service-to-store]
```

- All frame `nodes` and entry-point nodes must be included in the view's `nodes` list. A node has at most one direct frame membership. A frame may contain other frames via their `parent`; each parent's ID must exist in the same view, without cycles. Unassigned nodes remain outside the frames.
- `name`, `category`, and `description` label the permanent dashed frame. `tone` is `amber`, `sage`, `blue`, or `neutral` (default). The renderer does not infer a trust zone, namespace, or hosting boundary from a component's name.
- Frames are visual groups, separate from the logical entity `parent` and the existing expandable child-view scopes. Arrows keep their original entity endpoints even when crossing frames. Frames do not become artificial application components.
- A flow lists existing relationships in the displayed view, in the intended presentation order. The first flow is highlighted by default; the toolbar can select another flow or show all connections. Highlighted arrows receive step numbers, and unrelated arrows are muted. The declared order is not a computed routing path or runtime trace.
- The **Data entry** badge is supplied by `entryPoints`. **Fit path** frames the selected route; normal zoom, pan, entity documentation, and arrow inspection remain available.
- Duplicate membership/IDs, missing or cyclic frame parents, invalid entry points, repeated route edges, and out-of-view route references produce file-specific diagnostics. Invalid imports retain the last valid model.

## Communication protocols and broker paths

Relationships can specify a free-text protocol label and optional structured communication metadata:

```yaml
relationships:
  - id: worker-status-rpc
    target: status-service
    label: Queries order status
    protocol: gRPC / HTTP2 :9090
    communication:
      protocol: grpc
      mode: direct
  - id: publish-event
    target: event-broker
    label: Publishes a committed event
    protocol: AMQP / TLS :5671
    communication:
      protocol: amqp
      mode: brokered
```

Structured protocol values: `rest`, `grpc`, `tcp`, `websocket`, `http`, `amqp`, `kafka`, `mqtt`, `sql`, `configuration`, `messaging`, `other`. Modes: `direct`, `brokered`, or `logical` (an explicitly documented logical notification, distinct from its delivery transport). Both structured fields are optional and override automatic recognition. The original protocol/port label is retained in the diagram and inspector. When needed, the explicit classification is shown alongside it, for example `REST · HTTPS / JSON`.

Without structured metadata, OmniDocs recognizes explicit protocol names in the free-text `protocol` field. More specific application protocols take precedence over their lower-level transport (`gRPC / HTTP2`, `AMQP over TCP`, `WebSocket over TCP`). `HTTP / JSON` remains HTTP; it is not assumed to be REST. AMQP/Kafka/MQTT links and links touching logical `queue` entities default to brokered mode. A queue without a known wire protocol is shown as Broker / unspecified, not invented as AMQP. Explicit mode overrides this default. Unknown protocols remain Other / unspecified.

Protocol color is shared by the path, arrowhead, animated markers, and the **Connection legend**. Direct network links are solid; brokered links are dashed; configuration projection is dotted. Input-route selection and arrow inspection change width/emphasis without replacing the protocol color. Parallel relationships between the same visual node pair use separate rounded channels and retain their original direction and endpoints.

The connection key lists every supported protocol color and communication-mode pattern. It opens initially on desktop except in context overviews, and remains available as an expandable key on mobile. The open key reserves its own area below the drawing; resizing the key refits the drawing to its actual remaining space. Dense diagrams show connection labels on hover/selection to keep cards visible; full relationship text stays in the inspector. This mapping is a viewer convention, not an official C4 palette. BPMN sequence/message-flow notation remains governed by BPMN XML; no network protocol is inferred from a business-process arrow.

## Code mapping with separate Backend and Frontend repositories

Repository definitions live in the project Markdown document. Every mapping references one repository ID; its area, URL, and default ref are never guessed from a filename or the current C4 level.

```yaml
repositories:
  - id: service-code
    name: Service backend
    area: backend
    provider: gitlab
    url: https://git.example.org/team/service
    ref: v1.0.0
  - id: browser-code
    name: Browser frontend
    area: frontend
    provider: github
    url: https://github.example.org/team/browser
    ref: ui-v2.0.0
```

`area` is `backend`, `frontend`, or `shared`. `provider` is `github` or `gitlab`, including explicitly identified self-hosted installations. `url` is the HTTP(S) repository web URL, without credentials, query parameters, or fragments. `ref` is required and can identify a commit, tag, or branch. Use a commit when the documentation needs an immutable code version; branch heads and tags can move.

An entity document can contain multiple mappings:

```yaml
code:
  - repository: service-code
    path: internal/http/checkout.go
    kind: file
    symbol: CheckoutHandler.ServeHTTP
    lines:
      start: 20
      end: 84
  - repository: browser-code
    path: src/features/checkout/CheckoutPage.tsx
    kind: file
    symbol: handleCheckout
    ref: ui-v2.1.0
```

`repository` and `path` are required. `kind` defaults to `file`; `directory` targets a directory, including `path: .` for the repository root. Paths are normalized and repository-relative, with forward slashes; absolute paths, traversal, backslashes, and empty segments are rejected. A per-mapping `ref` overrides only that mapping's repository default. `symbol` identifies the documented class/function/interface or module; the viewer does not search or verify it. Optional line hints require positive integers, an ordered range, and a file target. A line number is a navigation hint, not the identity of a symbol.

The inspector's **Code** tab groups Backend, Frontend, and Shared mappings independently. A C4 `code` element opens that tab when selected. Other mapped elements have a Linked code button in their documentation. The **MD** tab continues to show the architecture document source. File/directory links use the correct provider URL and ref, with provider-specific line anchors and encoded path segments.

C4 code views remain explicit views scoped to a component; repository metadata alone does not create a code diagram or infer dependencies. Level-4 navigation stays in the current/selected container branch, so Frontend code is not replaced by Backend code when switching levels. From a system-wide overview, the selector can list the documented code views across branches.

This is explicit source traceability in the OmniDocs input adapter, not repository analysis or official C4 serialization. No clone, code fetch, filesystem lookup, symbol verification, automatic mapping, or editor launching occurs. The standalone HTML retains the mapping metadata and can construct links without a document backend; opening a repository URL requires access to that repository. The bundled sample uses fictional URLs/paths and labels its mappings as examples.
