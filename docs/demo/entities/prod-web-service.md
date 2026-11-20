---
id: prod-web-service
kind: deployment
name: Storefront Service
description: Provides the stable cluster endpoint for the storefront Pods.
technology: Service · ClusterIP :80
parent: prod-app
owner: Platform team
tags:
  - Network abstraction
relationships:
  - id: svc-web-pods
    target: prod-web-pods
    label: Selects ready storefront Pods
    protocol: HTTP :80
    description: The storefront-svc selector resolves only ready storefront Pod endpoints.
    payload: []
---

# Storefront Service

Kubernetes Service `storefront-svc` exposes port 80 inside commerce-app. Ingress routes the public `/` path here. A Service is a virtual network abstraction, not another application process.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
