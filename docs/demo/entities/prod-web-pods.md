---
id: prod-web-pods
kind: deployment
name: Storefront Pods ×2
description: Serves the React storefront build from two Nginx Pods.
technology: Deployment · Nginx · React build
parent: prod-app
owner: Platform team
tags:
  - 2 replicas
  - "Logical: storefront"
relationships: []
---

# Storefront Pods ×2

The `storefront` Deployment maintains two ready Pods with anti-affinity across workers. Each runs Nginx and serves the same versioned React build. The customer browser, rather than these static-server Pods, submits checkout API requests through `/api`.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
