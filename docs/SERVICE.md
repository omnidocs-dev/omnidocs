# OmniDocs service

The local editor and portable HTML remain available. Service mode adds authenticated accounts, verified email, an Organization → Project → Space hierarchy, invitations, inherited access, revocable read-only links, and a separate Markdown revision history for each space. Existing local folders are never automatically assigned to an account or exposed by service mode.

## Personal mode with SQLite

Requires Node 22.14 or newer. Install dependencies with `npm ci` on the first run.

```sh
npm run service:local
```

The personal launcher uses the same API and frontend as production. It opens a loopback address, chooses a free port starting at 4174, and uses SQLite at `.service-data/metadata.sqlite`. Docker and PostgreSQL are unnecessary. On macOS, you can double-click `Start OmniDocs Service.command` after installing dependencies.

On the first run, the terminal shows an administrator login for `/admin/` and an activated personal member login for the home page. Save both generated passwords in your password manager. Later starts preserve the accounts and their passwords. If the database already has an administrator, it keeps that account and prints only newly created credentials. Only password hashes go into SQLite.

Personal mode keeps signup, access control, sharing, editing and revision history. Email goes into the local development mailbox at `.service-data/development-mail/`. Production uses its configured HTTPS and mail delivery.

For frontend development, use `npm run service:dev`, then open **http://127.0.0.1:5173**. The Vite proxy forwards `/api` to 4174; authentication Origin checks use the frontend URL. Use the configured hostname consistently.

The built HTML file is an offline workspace snapshot, not the hosted account system. Use the server URL for accounts and shared links.

## Sign in with ZITADEL

1. In the ZITADEL Console, open your project and create a **Web** application using the **PKCE** authentication method. Register the redirect URI shown in OmniDocs under **Admin → Settings → ZITADEL SSO**. For example, use `https://docs.example.com/api/auth/zitadel/callback` for a hosted service. For personal mode, use the exact address printed by the launcher, such as `http://127.0.0.1:4174/api/auth/zitadel/callback`, and enable Development Mode for that application in ZITADEL. Use the exact scheme, host, and port when opening OmniDocs.
2. Under **Admin → Settings → ZITADEL SSO**, enter the ZITADEL instance's HTTPS origin and the application's Client ID. Click **Save ZITADEL settings**. OmniDocs saves these values in its database. Changing either value disables SSO until you enable it again.
3. Open **Admin → Settings → ZITADEL SSO** and click **Enable ZITADEL SSO**. Open the member sign-in page and choose **Login with SSO**. The server needs HTTPS access to your ZITADEL instance.

SSO is disabled by default. On the first successful sign-in with a verified ZITADEL email, OmniDocs links the matching active member account or creates a verified member account without a password. The new account is bound to the ZITADEL identity and follows the access rules for ordinary members. The registration mode controls password signups. SSO uses ZITADEL email verification to activate new members. Use a ZITADEL instance whose email verification you trust. Administrators continue to use the separate `/admin/` sign-in. **Disable ZITADEL SSO** blocks new and in-progress SSO sign-ins. Existing OmniDocs sessions remain active until sign-out, expiration, or revocation in **Admin → Users**.

When diagnosing a sign-in failure, run `./omnidocs logs -f backend` on the deployment server or watch the terminal running the local service. Reproduce the sign-in and look for `sso.failed`. The `flowId` links the start and callback logs. The `stage` and `reason` identify where the attempt stopped. A trace that ends at `redirect_to_provider` shows that OmniDocs logged the outbound redirect and received no matching callback.

## Accounts and administrator access

- Users can open `/#/login`, `/#/register` and `/#/forgot` on the service URL. Public registration creates a standard account.
- Open `/admin/` from an approved management IP or VPN. On the first HTTPS sign-in, use the password and CAPTCHA to open authenticator setup. Confirm the six-digit code to unlock the dashboard. Later sign-ins also require an authenticator code. In **Admin → Settings → Authenticator**, enter a fresh code from your current authenticator to start a replacement. Overview shows account status, organization, project and workspace totals, and recent activity.
- In **Users**, search and filter accounts. An account page shows owned resources, access grants, active sessions and recent actions. Administrators can edit the display name, suspend or reactivate the account, sign it out and manage existing Viewer or Editor grants.
- In **Resources**, search by title or owner and filter by type or status. Edit names and descriptions, or archive and restore resources. An archived resource and its descendants pause regular access, including share links. Restoring reevaluates the existing membership and link rules. Archived resources count against the owner's plan.
- **Activity** lists recorded account, workspace, review and administrator actions with pagination and a source filter. Account suspension prevents sign-in and revokes sessions. Resource archival controls document and link access separately.
- The site administrator is a record in `users` with the `admin` role. Password verification uses the same salted scrypt format as member accounts. During initial setup, enter a password of 16–128 characters or create the account after startup with `./omnidocs admin rotate-password`. The administrator has a separate privileged session bound to the user ID.
- The administrator uses a separate session scoped to `/admin/`. The public account flow uses email and a separate cookie. Rotating the administrator password or authenticator key invalidates existing administrator sessions.

Open **Admin → Settings** to choose how new accounts activate. **Email verification** sends a link through the configured transport. **Administrator approval** leaves each request pending until an administrator opens **Users**, selects the account, and clicks **Approve account**. Give the one-time link to the account owner so they can choose their password. **Automatic activation** is available for direct loopback deployments and lets users choose a password at registration. Accounts created this way must prove email ownership before they can sign in after moving the service to a public URL. In SSH preview mode, email delivery is optional. Without an email transport, use administrator approval or automatic activation.

User registration and both password sign-in forms start without CAPTCHA. A failed attempt requires a self-hosted image CAPTCHA for retries from the same IP and form for up to 15 minutes. Each challenge expires after three minutes and is single-use. User sign-in limits attempts by client IP, email and their combination. Administrator sign-in limits attempts both per IP and across the instance. Attempt limits are stored in the database and apply to all API clients.

To open the administrator panel directly, run the local launcher with `-- --admin`. Enter the credentials shown on first setup. The legacy `service:admin` launcher still accepts a custom initial password in an interactive terminal.

```sh
npm run service:local -- --admin
```

## Structure and permissions

- Any verified user can create their own organizations.
- The Free plan allows one owned organization, two owned projects, and three owned workspaces per account. The workspace limit is shared across projects. Resources shared by invitation count toward their owner's limits. Existing resources above a limit remain accessible and editable.
- Owners create projects inside an organization and independent spaces inside a project. Every space starts with the supported canonical Markdown architecture structure and empty containers view.
- An owner can invite an exact email as `viewer` or `editor`, at any of the three levels. The invited user must verify that email and explicitly accept the invitation; invitations expire in seven days.
- Parent grants apply to all current and future descendants. Effective access is the strongest active direct/inherited grant. A child viewer grant cannot downgrade a parent editor grant.
- Only owners manage members, invitations and links. Editors change architecture documents; viewers read them.
- Access screens show direct and inherited grants. Inherited grants must be revoked at their source. Removing a parent grant does not remove independent child grants.
- A space link is always read only. Public links require possession of the URL. Restricted links additionally require a signed-in, verified account whose exact normalized email is listed on that link. They do not create membership or allow editing.
- Links expire after 1–365 days and can be revoked earlier. Copy a newly created link immediately; only its hash is retained, so an old URL cannot be reconstructed from the access screen.
- Read access covers the entire space: its diagrams, Markdown sources, model properties, payload documentation, and export. Share a separate sanitized space when less information should be visible.

Each request rechecks the session and effective permissions. The service does not mount the unauthenticated local APIs or the local global file-event broadcast. The editor refreshes an open service workspace periodically while not editing. Revision conflicts return HTTP 409 instead of overwriting another writer's changes. An in-flight refresh cannot overwrite an active editing session.

## Import and export a workspace

- Open a project you own and select **Import workspace**. Choose an existing Markdown folder or a downloaded `.omnidocs.json` export. OmniDocs validates the documents and shows the result before creating a workspace. Imports count toward the Free plan.
- Open a workspace in the editor and select **Export workspace**. The download contains its current published Markdown documents and relative paths, including saved diagram layouts and any Structurizr sources stored in Markdown. The existing model JSON download serves diagram model consumers.
- Import creates an independent workspace and records the imported documents as its first version. The export format carries workspace documents and metadata. Access grants, invitation links, pending drafts and earlier history are outside the exported snapshot. The transfer limit is 2,000 Markdown files and 10 MiB.

## Change history and review

- Open **History** inside a space. Use the arrows to move between entries and **Before** or **After** to preview a snapshot on the canvas. The change tree shows affected views, elements, relationships, layout, and Markdown files with previous and new values. Added, updated, and removed items have distinct canvas highlights. Elements that were removed appear in **Before**.
- By default, editors can publish changes directly or submit them for review. A space owner can enable **Require review before publishing** and designate reviewers by email under **History → Review settings**. A designated reviewer also needs editor access to the space. Owners can review by default. An author needs a different reviewer to approve their own request.
- Submit from **Edit workspace → Review & submit**. The reviewer can comment, request changes, or approve and publish. Members with viewer access can browse published history. Public and email-restricted share links show the current published documents.
- If another version publishes during review, approval waits for the author to update the request against the latest version. The server checks for overlapping edits. Layout-only saves are recorded separately and publish immediately.

## Storage

The default transactional SQLite database at `<data>/metadata.sqlite` stores published Markdown snapshots, review requests and history events. The service captures the first snapshot from the space folder under `<data>/workspaces/<space UUID>/` on the first history visit, proposal or save. Subsequent hosted reads use published snapshots in the database. The local folder editor continues to save directly to Markdown. Any history from before the first snapshot is outside the service timeline.

This default is intended for a single service instance on persistent local storage. Do not run separate SQLite instances against independently copied volumes. Back up the metadata database consistently (including pending WAL, or with SQLite's backup facility) and the workspace folders together, and verify restores.

A PostgreSQL adapter is implemented in `server/service/database.ts` using the locked Postgres.js dependency. It is selected by `DATABASE_URL` or by the Docker Compose database settings. The adapter uses bound parameters and an advisory transaction lock. Workspace seed folders still need persistent storage alongside the database.

```sh
DATABASE_URL='postgresql://USER:PASSWORD@HOST/DATABASE' npm run service
```

The Docker Compose stack uses one backend instance. PostgreSQL execution needs a deployment smoke test. Test backup restoration and shared-volume behavior before using multiple replicas. Initial table creation is idempotent; future schema changes require versioned migrations.

## Public deployment configuration

### Docker Compose on the deployment server

`compose.yaml` runs the React build in Caddy, the Express API in Node, and PostgreSQL 18 in separate services. Only the frontend port is published. The default bind address is loopback. For public deployment, configure the actual domain, listener and HTTPS port. Use a browser-trusted certificate and keep the backend and database ports private. If you place another proxy in front of Caddy, keep administrator access on a direct management path or configure and verify real client IP handling before allowing that proxy to reach the admin routes.

For manual transfer, copy `omnidocs-compose.tar.gz` to the server and extract it into the deployment directory. Setup generates the bundled database password in the private `.env` and asks for the email webhook when needed. If you enter an initial administrator password, setup stages a scrypt hash until the account is created in PostgreSQL. Keep the existing `.env` when replacing the code for a later deployment.

```sh
cd /opt/omnidocs
tar -xzf /path/to/omnidocs-compose.tar.gz
./omnidocs setup
./omnidocs update
./omnidocs status
```

Alternatively, run this from the local checkout to copy source and deploy:

```sh
bash scripts/deploy-compose.sh operator@docs-server.example
```

The deploy script opens setup on the server when configuration is incomplete. Subsequent uploads preserve the server configuration and named volumes. Use `./omnidocs admin status` to check whether the administrator account exists. Import local data separately when needed.

On the server, check the three health states and the private CA certificate:

```sh
cd /opt/omnidocs
docker compose ps
docker compose exec -T frontend cat /data/caddy/pki/authorities/local/root.crt
```

Use the trusted frontend URL for `/api/health`, the regular sign-in flow and `/admin/`. Back up PostgreSQL with `pg_dump` and the workspace volume separately. Preserve Caddy's data volume if LAN devices trust its internal CA.

If Compose reports an unhealthy backend, check `docker compose ps -a` and `docker compose logs --tail=80 backend` from `/opt/omnidocs`. The SSH deployment script prints this information when startup fails.

Frontend health checks use the internal HTTP proxy path. Verify TLS on the published frontend port with a client that trusts the configured CA. Caddy uses the configured site host to select the certificate when a client connects by IP without SNI.

### Preview over SSH without Caddy

Copy `compose.direct.yaml` next to `compose.yaml` on the server. The existing backend image serves both React and the API in this mode. The preview binds to the server's loopback interface and uses the existing PostgreSQL service and data volumes.

On the client, open an SSH session that forwards the preview port:

```sh
ssh -o ExitOnForwardFailure=yes -L 127.0.0.1:8417:127.0.0.1:8417 operator@docs-server.example
```

In that SSH session, start the preview:

```sh
cd /opt/omnidocs
docker compose -f compose.yaml -f compose.direct.yaml up -d --no-build --wait backend database
docker compose stop frontend
```

Keep the SSH session open and visit `http://127.0.0.1:8417` or `http://127.0.0.1:8417/admin/` in the browser. Verification and sharing links created in this mode use the tunneled URL. To return to the HTTPS deployment, run `docker compose up -d --wait` with the base configuration.

### Running behind an existing reverse proxy

```sh
export OMNIDOCS_PUBLIC_URL='https://docs.example.com'
export OMNIDOCS_SERVICE_DATA='/var/lib/omnidocs'
export OMNIDOCS_MAIL_WEBHOOK='https://mail-adapter.example.com/send'
export OMNIDOCS_MAIL_TOKEN='configure-on-the-server'
npm run build
npm run service
```

Serve frontend and API under the same HTTPS origin through a reverse proxy. The default backend binding is `127.0.0.1:4174`; configure `OMNIDOCS_HOST` explicitly for container networking. Keep the storage directory outside the web root. Do not set `OMNIDOCS_DEV_MAIL` for a public deployment.

The configured mail endpoint receives a JSON `POST` containing `{to, subject, text}`, with an optional Bearer authorization token. Configure it to deliver verification, reset and invitation emails through your mail provider. Return a successful HTTP status only after accepting delivery. Use HTTPS for the webhook. The transport rejects redirects and times out after 15 seconds. The service retries queued messages with backoff and deletes them after delivery or expiry. Monitor the backend events `mail.delivery_failed` and `mail.queue_failed`.

To forward security and delivery warnings, set `OMNIDOCS_SECURITY_ALERT_WEBHOOK` to an HTTPS endpoint and optionally set `OMNIDOCS_SECURITY_ALERT_TOKEN`. Each warning type sends at most once per five minutes per backend instance. Payloads include the time, event, route template, and optional status. The backend logs each event as JSON, and Compose rotates the backend logs.

Sessions use opaque random tokens stored as hashes, HttpOnly/SameSite cookies, and Secure cookies for an HTTPS public URL. Writes validate the exact configured Origin and session CSRF token. Passwords use salted scrypt. Activation and reset links expire, are single-use, and revoke existing sessions. The activation link lets the mailbox owner set the first valid password. Authentication attempts are rate limited in the metadata database. Ownership and permission decisions are made in the API, regardless of frontend controls.

PostgreSQL serializes hierarchy and access changes and coordinates workspace writes per space. Password derivation and import validation run outside those locks. The service enforces resource quotas, limits JSON bodies, and logs access changes, unexpected API errors, and administrator sign-in outcomes. Load, delivery, recovery and deployment-specific proxy tests remain part of releasing it for public traffic. Live collaborative merging, billing, account deletion and ownership transfer are not implemented in this first service iteration.

## Management commands

Run `./omnidocs` on the deployment server from the extracted project directory. The setup wizard saves the HTTPS or SSH preview choice in `.env`. Override it for an individual command with `--direct` or `--https`.

The wizard also asks for the administrator username and password, the management IPs or VPN CIDRs, the HTTPS mail webhook and optional token, and the PostgreSQL mode. Rerunning setup preserves the database administrator password. Use `./omnidocs admin rotate-password` to set a replacement. The wizard displays a summary before saving. For external PostgreSQL, prepare a database for OmniDocs and enter its connection URL when prompted. The external service must be reachable from Docker. The backend validates the connection and runs migrations when it starts. Switching databases changes the connection and requires a separate data migration if you want to carry over existing data.

| Command | Action |
| --- | --- |
| `./omnidocs setup` | Configure the address, initial administrator, email delivery and database in `.env`. |
| `./omnidocs run` | Start existing images and wait for the health checks. |
| `./omnidocs stop` | Stop the containers. Their data stays in the volumes. |
| `./omnidocs backup` | Save a PostgreSQL dump, workspace files and checksums in a private directory under `backups/`. |
| `./omnidocs update` | Rebuild and deploy the current source files. Run it after copying a new release into the directory. Use it for the first build too. |
| `./omnidocs restore backups/BACKUP_DIR` | Verify checksums, ask for confirmation, take a safety backup and restore the selected backup. |
| `./omnidocs admin status` | Show the administrator username. |
| `./omnidocs admin rotate-password` | Enter a new password privately, update its hash in the database, and revoke existing administrator sessions. |
| `./omnidocs admin rotate-otp` | Replace the authenticator key in the database, show the new key once, and revoke administrator sessions. Use the panel for normal rotation. |
| `./omnidocs logs -f backend` | Follow backend logs. Use `database` or `frontend` for those services. |
| `./omnidocs status` | List containers and their health states. |

Backups briefly stop the backend so workspace files and PostgreSQL match. The command restores the previous running state after completion. Set `OMNIDOCS_BACKUP_DIR` to use a different directory. Only restore backups from your own deployment. Preserve the server's private `.env` and Caddy volumes separately if you need to recreate the server configuration or CA.

## Upgrading an HTTPS deployment

After extracting the release, run `./omnidocs setup` and enter the IP or VPN CIDR from which you will administer the service. Keep the management range narrow. Run `./omnidocs update` to build and start the release, then visit `/admin/` to enroll. On upgrade, `./omnidocs update` imports an existing administrator and its effective authenticator into the database. The command clears the bootstrap verifier and legacy authenticator from `.env` after it confirms the account exists. The administrator signs in again after migration. Rotate old passwords or keys if they were shared or remain in a legacy backup. Unset any administrator bootstrap variables exported by the shell after migration.

Verify a regular sign-in, an email activation and reset, administrator access from a permitted network, and denial from a second network. Check HTTPS for the public hostname, verify provider delivery, and run `npm audit` and image scanning from an environment that can reach the advisory feeds. If the previous service was publicly available, review accounts created under the old activation flow and contact affected owners to reset credentials and revoke old access.

## API groups

- `/api/auth/*`: register, login, verification, resend, logout, forgot/reset and current session.
- `/admin/api/*`: isolated administrator sessions and the registered-user directory.
- `/api/tree`, `/api/resources`: authorized hierarchy and resource creation.
- `/api/resources/:id/access`, `/api/resources/:id/invitations`: owner-managed access.
- `/api/invitations`, `/api/invitations/:id/accept`, `/api/memberships/:id`: invitation acceptance and owner revocation.
- `/api/spaces/:id/workspace`, `/api/spaces/:id/edits`: private documents and permission-checked saves.
- `/api/spaces/import`: validates a document bundle and creates a new space in an owned project.
- `/api/spaces/:id/history`: published snapshots, change requests, review events and space review settings.
- `/api/spaces/:id/shares`, `/api/shares/:id`, `/api/share/:token/workspace`: owner-created links and read-only access.

Tests exercise the real Express routes over in-memory HTTP transport and a real temporary SQLite database, including restart persistence, cross-account isolation, inheritance, future descendants, revocation, CSRF, invitation email matching, public/restricted shares, token replay, password reset and rate limiting. Browser QA uses a request bridge to this same Express app when loopback sockets are unavailable; it does not prove real network/HTTPS/mail delivery.


## Startup diagnosis

The server reports successful startup only after its HTTP socket is listening. Port conflicts and permission errors exit nonzero. `service:local` avoids an occupied port and only opens the browser after `/api/mode` returns JSON with `mode: service`. An older local server or a static frontend cannot satisfy this check. The frontend reports the failing API URL/status instead of only showing a generic connection error. `EPERM` when opening a socket is an execution-environment restriction; the launcher must then be run in a terminal allowed to open local ports.
