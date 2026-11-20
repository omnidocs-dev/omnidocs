---
id: production
kind: view
name: Production deployment
type: deployment
scope: commerce
nodes:
  - prod-clients
  - edge
  - prod-control
  - prod-workers
  - prod-ingress
  - prod-telemetry
  - prod-web-service
  - prod-web-pods
  - prod-api-service
  - prod-api-pods
  - prod-worker-pods
  - prod-config
  - prod-pg-service
  - prod-pg-primary
  - prod-pg-replica
  - prod-rmq-service
  - prod-rmq-pods
  - prod-volumes
  - prod-backups
  - payments
  - notifications
description: "Kubernetes production: public ingress, application workloads,
  durable data, and external integrations."
direction: RIGHT
boundaries:
  - id: public
    name: Public data entry
    category: Internet / edge
    description: Customer input enters through encrypted HTTPS requests.
    tone: amber
    nodes:
      - prod-clients
      - edge
  - id: cluster
    name: Production Kubernetes
    category: Cluster boundary
    description: Private compute, ingress, application namespaces and durable data.
    tone: blue
    nodes: []
  - id: platform
    name: Cluster platform
    parent: cluster
    category: Management / operations
    description: Control plane, worker capacity and observability.
    tone: neutral
    nodes:
      - prod-control
      - prod-workers
      - prod-telemetry
  - id: ingress
    name: Ingress routing
    parent: cluster
    category: Traffic entry
    description: Host/path routing to the application Services.
    tone: amber
    nodes:
      - prod-ingress
  - id: applications
    name: commerce-app
    parent: cluster
    category: Application namespace
    description: Services, application Pods and runtime configuration.
    tone: sage
    nodes:
      - prod-web-service
      - prod-web-pods
      - prod-api-service
      - prod-api-pods
      - prod-worker-pods
      - prod-config
  - id: data
    name: commerce-data
    parent: cluster
    category: Stateful namespace
    description: Database, event broker and independent persistent volumes.
    tone: blue
    nodes:
      - prod-pg-service
      - prod-pg-primary
      - prod-pg-replica
      - prod-rmq-service
      - prod-rmq-pods
      - prod-volumes
  - id: external
    name: External dependencies
    category: Outside cluster
    description: Payment, email and off-cluster database backups.
    tone: neutral
    nodes:
      - prod-backups
      - payments
      - notifications
entryPoints:
  - node: prod-clients
    label: HTTPS request
flows:
  - id: checkout-input
    name: Checkout data
    description: Browser input through TLS, ingress and API to durable database storage.
    relationships:
      - clients-edge
      - edge-ingress
      - ingress-api
      - svc-api-pods
      - pods-pg
      - svc-pg-primary
  - id: event-input
    name: Order events
    description: Browser request through the API, broker Service and queue to
      fulfillment consumers.
    relationships:
      - clients-edge
      - edge-ingress
      - ingress-api
      - svc-api-pods
      - pods-rmq
      - svc-rmq-pods
      - brokers-workers
---

# Production deployment

## Explore this environment

Permanent labeled frames show public input, Kubernetes, ingress, the application/data namespaces, platform operations and external dependencies. Use the **Input path** controls to highlight the numbered checkout or event path; **All connections** shows the complete graph. Select individual cards and arrows for documentation. Separate cluster/application/data views remain available in the explorer.

## Request path

Customer browser → public load balancer → Kubernetes ingress → storefront or API Service → ready application Pod. API Pods persist order state and publish events; fulfillment Pods consume events and send confirmations.

## Deployment key

- Solid infrastructure cards identify cluster, namespace, compute, networking, or storage resources. The technology line states the specific resource type.
- Dashed, titled frames are declared in Markdown: amber marks public/ingress entry, green groups application resources, blue groups the cluster/data boundaries, and neutral groups operations/external resources. Namespace frames are logical resource groups, not physical nodes or numbered C4 levels. Solid frames remain reserved for interactive expanded elements.
- Replica groups aggregate identical Pod instances, with desired counts in the card titles.
- Directed arrows state request, dependency, metrics, or configuration-projection intent and show its protocol. Moving markers illustrate direction, not live traffic.
- External provider cards retain dashed borders. Off-cluster backup storage is outside the Kubernetes boundary.

## Example assumptions

This fictional topology has three worker nodes, two ingress Pods, two storefront Pods, three API Pods (HPA 3–8), two fulfillment Pods, a PostgreSQL primary/replica pair, and three RabbitMQ Pods. It documents an example architecture; no infrastructure is provisioned.

## References

- [C4 deployment diagrams](https://c4model.com/diagrams/deployment)
- [Kubernetes architecture](https://kubernetes.io/docs/concepts/architecture/)


## Communication key

Open **Connection legend** on the canvas for protocol colors and line patterns. REST, gRPC, WebSocket, TCP health checks, SQL, and AMQP links have distinct colors. Direct network links are solid; brokered message links are dashed; configuration projection is dotted. Input-route selection changes thickness and emphasis while retaining the protocol color. Parallel relationships have separate channels. All added endpoint/health-check examples are declared in the entity Markdown documents.
