---
id: production-app
kind: view
name: Application workloads
type: deployment
scope: prod-app
nodes:
  - prod-web-service
  - prod-web-pods
  - prod-api-service
  - prod-api-pods
  - prod-worker-pods
  - prod-config
description: Services, stateless Pod replica groups, and configuration in commerce-app.
parentView: production-cluster
direction: RIGHT
---

# Application workloads

Services select ready Pod endpoints; ConfigMap and Secret arrows show configuration projection rather than network requests. The API and worker data dependencies are drawn at namespace level in Cluster internals; external calls are drawn in Production deployment. The storefront is a static React build whose browser-side API calls return through ingress.
