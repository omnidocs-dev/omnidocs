---
id: prod-app
kind: deployment
name: commerce-app namespace
description: Groups stateless storefront, API, and fulfillment workloads.
technology: Kubernetes Namespace
parent: runtime
owner: Platform team
tags:
  - Application workloads
relationships:
  - id: app-postgres
    target: data-node
    label: Reads and writes order state
    protocol: PostgreSQL / TLS :5432
    description: Backend API and Fulfillment Worker Pods connect to
      postgres-rw.commerce-data.svc.
    payload: []
  - id: app-rabbitmq
    target: data-node
    label: Publishes and consumes events
    protocol: AMQP / TLS :5671
    description: The API publishes order events and workers consume them through
      rabbitmq.commerce-data.svc.
    payload: []
    communication:
      protocol: amqp
      mode: brokered
---

# commerce-app namespace

Expand this namespace to inspect Services and Pod replica groups. Services are stable network abstractions; Pods execute the application containers.

| Logical container | Deployment resource | Desired replicas |
| --- | --- | --- |
| Web Storefront (storefront) | storefront Deployment | 2 |
| Backend API (api) | api Deployment | 3; HPA range 3–8 |
| Fulfillment Worker (worker) | fulfillment Deployment | 2 |

Horizontal Pod Autoscaler (HPA) is illustrated for the API only. Rolling updates use readiness checks before routing traffic to new Pods. Network policies allow ingress to the two public Services and allow application egress to the required data Services and external providers.

[Deployment semantics](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) and [Service semantics](https://kubernetes.io/docs/concepts/services-networking/service/) follow Kubernetes terminology.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
