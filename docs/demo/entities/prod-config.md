---
id: prod-config
kind: deployment
name: Configuration and secrets
description: Projects runtime configuration and credentials into application Pods.
technology: ConfigMap · Secret
parent: prod-app
owner: Platform team
tags:
  - Kubernetes resources
relationships:
  - id: config-web
    target: prod-web-pods
    label: Projects public runtime settings
    protocol: ConfigMap volume
    description: The storefront receives public application settings without
      database credentials.
    payload: []
  - id: config-api
    target: prod-api-pods
    label: Projects API configuration
    protocol: ConfigMap + Secret volumes
    description: API Pods receive required configuration and credential references.
    payload: []
  - id: config-worker
    target: prod-worker-pods
    label: Projects worker configuration
    protocol: ConfigMap + Secret volumes
    description: Worker Pods receive broker, database, and provider configuration.
    payload: []
---

# Configuration and secrets

ConfigMaps supply non-secret settings. Secrets supply credential references to authorized Pods through projected volumes. These arrows describe resource projection, not network requests. Secret values are intentionally absent from this example documentation.

## Example scope

This is the fictional Orbit Commerce production environment. Replica counts, resource choices, and operational policies are illustrative documentation, not executable Kubernetes manifests.
