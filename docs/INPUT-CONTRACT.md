# Project independence and architecture input

OmniDocs is an architecture-document viewer for user-provided projects. The bundled Orbit Commerce/Kubernetes workspace is test and demonstration data; it does not define the renderer's domain or an obligatory topology.

## Renderer contract

- Project names, entity IDs, technologies, relationships, scopes, and view membership originate in input documents.
- Rendering, hierarchy navigation, inline expansion, colors, and layout use element/view types and references, never application-specific names or IDs.
- C4 diagrams share one model. Clicking an element resolves a view scoped to that element; absent child views remain absent.
- Deployment is a complementary perspective. A deployment entity may expand a scoped deployment view. Physical hosting, namespace/resource grouping, and logical C4 ownership must remain explicitly documented rather than inferred from a name.
- Source import and normalization are separate responsibilities from React Flow rendering. Adding an input syntax must map to a shared model and must not introduce project-specific rendering branches.
- A new project must work by changing its document folder, without editing UI or parser code.

## Current input support

The implemented parser accepts the shared OmniDocs YAML frontmatter contract described in [FORMAT.md](FORMAT.md), with Markdown document bodies and BPMN XML inside BPMN view documents. This is a product-specific serialization usable across projects, not an official C4 interchange format.

Structurizr workspace JSON inside Markdown is now supported for context, container, and component views, with stable ID/reference normalization and optional DSL snapshot-digest verification. Direct compilation of Structurizr DSL, Mermaid C4 parsing, C4-PlantUML parsing, and other Structurizr view families have **not** been implemented. Recognizing a C4 concept in prose does not establish an unambiguous machine-readable graph. Do not claim support for a syntax until its parser, reference resolution, view mapping, and diagnostics have been implemented and tested.

## Applied interoperability path

The supplied logistics folder establishes the active path: keep its authoritative Structurizr DSL in Markdown and consume the official JSON snapshot already exported alongside it. Validate the declared SHA-256 against the exact fenced DSL bytes before normalization; do not hand-convert the user’s documents into a second authoritative model. The renderer consumes a supported JSON projection, not executable DSL. An alternative syntax needs its own parser and identity rules.

The Markdown envelope, input tool syntax, C4 architectural meaning, and OmniDocs renderer model must be documented separately. Preserve the current frontmatter path as a compatibility input when adding a new format.

## Evidence

`tests/project-independence.test.ts` exercises unrelated Research Archive and Civic Planner workspaces, arbitrary IDs, all four C4 levels, directed relationships, and non-Kubernetes VM deployment expansion through the same Markdown compiler, layer resolver, and layout engine. The Research Archive fixture was also imported and expanded through levels 1–4 in the actual standalone HTML without renderer changes.

## Primary references

- [C4 notation is independent of a specific syntax](https://c4model.com/diagrams/notation)
- [Structurizr DSL](https://docs.structurizr.com/dsl)
- [Mermaid C4 syntax](https://mermaid.js.org/syntax/c4.html)

The active project folder is selected by `omnidocs.config.json`; the same generic selection logic is shared by the document API and portable builder. See [Structurizr import](STRUCTURIZR-IMPORT.md) for current scope and limitations.
