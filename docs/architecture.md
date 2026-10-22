# Architecture

## Purpose

The application manages VLANs, hosts, host groups, and policies for Extreme Networks switches. Each host, group, and policy belongs to one required VLAN. A policy contains one or more source-to-destination entries and can be rendered as a `.pol` file and sent to a selected switch over SSH/SFTP.

## Technology Stack

- **Frontend:** Vue 3, TypeScript, and Vite.
- **Backend:** Bun and Elysia, with feature-specific route modules and services.
- **Persistence:** Prisma ORM and PostgreSQL.
- **Switch transport:** SSH/SFTP using server-side credentials loaded from `SWITCHES_JSON`.
- **Container runtime:** Docker Compose with an application container and PostgreSQL container.

## Application Boundaries

```text
Browser (Vue)
    │ same-origin /api/* and /api/switches/terminal WebSocket
    ▼
Elysia API ── feature routes ── application services
    │                                  ├── policy formatter
    │                                  ├── SSH/SFTP switch client
    │                                  └── interactive SSH terminal session
    ▼
Prisma repositories / PostgreSQL
```

`apps/web` owns presentation and form state. `apps/server/src/modules` groups API routes, input contracts, persistence calls, and service logic by feature. ACL rendering lives in `modules/policies/acl-formatter.ts`; switch delivery and interactive terminal sessions live in `modules/switches/`. The API serves the compiled Vite application from the same origin in the production container.

The Administration workspace exports a versioned JSON snapshot of every application database table, including VLANs, hosts, groups and memberships, policies and entries, reflective links, and generated policy history. Import validates the backup and replaces the current records in one PostgreSQL transaction; a failed restore leaves the database unchanged. Switch SSH credentials and PostgreSQL connection settings remain in the destination server's `.env` and are not included in the backup.

## Data Model

- **VLAN:** required name of up to eight characters and numeric tag, with optional IPv4 address, CIDR mask prefix from 0 to 32, and description. IP address and mask must be supplied together. Names and tags are unique.
- **Group:** name and required VLAN, with a many-to-many relationship to hosts.
- **Host:** required VLAN, name of up to eight characters, description, IP address, and source mask.
- **Policy:** required description and VLAN, an automatically generated name based on the VLAN name, Internet Access flag, and one or more entries. A VLAN can be assigned to at most one policy, and the assignment cannot change while that policy exists. Deleting the policy releases the VLAN.
- **Policy entry:** a source and destination, each selected as exactly one host, group, or configured VLAN endpoint, with optional description, protocol, and destination port. VLAN endpoints require an IP address and mask. Cross-VLAN destination entries create linked reflective entries in the destination VLAN policy.
- **Policy link:** records the source and destination policy relationship, whether the relationship is still active, and whether the destination policy needs regeneration.
- **Generated policy:** the rendered filename and content, selected switch name, delivery result, and timestamp. This preserves the artifact and delivery outcome in PostgreSQL.
- **Switch:** configured outside the database so passwords remain in the deployment environment; only public identifiers and names are sent to the UI.
- **Terminal session:** short-lived SSH shell and pseudo-terminal opened for one browser WebSocket; the session is closed when the WebSocket closes or the user leaves the Terminal workspace.

The migration from the former ruleset model preserves existing policy pairs. If an old destination address and mask do not match a host already in the inventory, it creates a clearly named legacy host for that endpoint before removing the old rule tables.

The VLAN migration creates a `Default VLAN` with tag `1` and assigns existing hosts, groups, and policies to it. VLAN deletion is restricted while any of those records still refer to it. VLAN assignment is required by the create and update API contracts. The VLAN address migration converts existing subnet values into separate IP and mask fields where possible.

The database enforces the one-policy-per-VLAN rule with a unique constraint on `Policy.vlanId` and prevents changing an existing policy's VLAN with a database trigger. The API rejects attempts to move a policy and the editor locks its VLAN selector. Deleting a policy removes that assignment so the VLAN can be used for a new policy. The policy description is entered by the user and does not affect the generated ACL.

When an entry's destination belongs to another VLAN, saving creates a policy for that VLAN if one does not already exist, then creates or refreshes a reflective entry there with source and destination reversed. An automatically created policy is named from the destination VLAN and described as being for reflective ACL entries. The original destination port becomes the reflective source port, and the generated ACL entry name ends in `_r`. Reflective entries link to their source entry, so replacing or removing the source entry removes its linked reflection. Policy links become pending only when reflective ACL content changes; unchanged reflections keep their delivery status and position. Editing a host's parameters marks policies that reference it directly or through a group as pending. Changing a group's membership marks policies that reference that group as pending. Affected reflective counterparts and their specific policy links are marked too, so generating one side also delivers related pending policies without marking unrelated links.

## ACL Rendering

For each policy entry, the formatter expands a selected host to itself, a selected group to its member hosts, or a selected VLAN to its configured IP and mask. If both ends are groups, it generates one permit entry for each source and destination host combination. Source and destination addresses and masks come from the selected endpoints. Optional `protocol`, `source-port`, and `destination-port` lines are omitted when their values are blank; protocol appears before any port lines. Permit actions use `permit;`, entry names start with `perm_`, and reflective entry names end in `_r`. The formatter appends the three private IPv4 destination deny entries after the permit entries. If Internet Access is enabled, it adds `perm_INTERNET` for `0.0.0.0/0` as the final ACL entry; otherwise it ends with `deny_INTERNET` for `0.0.0.0/0`. Entry names are unique within the generated ACL.

VLAN assignment is stored as application metadata. When a VLAN is selected as a policy endpoint, its IP and mask are used in the generated ACL address fields.

Address, protocol, and port values in generated ACL lines are emitted without quotation marks. Permit entry names retain quotation marks; the three local-network deny entry names follow the configured Extreme policy format. The interface supports editing and deleting hosts, groups, and policies. Deleting a host or group removes policy entries that reference it. Searchable host and group selectors match names, descriptions, IP addresses, masks, and group members. The Policy Search tab matches full or partial IP addresses across every policy entry, including hosts within groups, and displays the complete source and destination data, protocol, ports, and originating policy description. The UI offers Light, Dark, Light Blue, and Dark Blue themes, defaults to Light, and stores the user's selection in browser local storage.

## API Overview

- `GET/POST/PATCH/DELETE /api/hosts`
- `GET/POST/PATCH/DELETE /api/groups`
- `GET/POST/PATCH/DELETE /api/vlans`
- `GET/POST/PATCH/DELETE /api/policies`
- `GET /api/administration/export` downloads a complete versioned database backup; `POST /api/administration/import` validates and transactionally restores that backup, replacing the current application records.
- `GET /api/switches` returns switch IDs and display names only.
- `WS /api/switches/terminal?switchId=...` opens an interactive SSH shell for a configured switch. The server uses credentials from `SWITCHES_JSON`, checks that the WebSocket request has the application's origin, streams CLI input/output, and forwards terminal size changes to the SSH pseudo-terminal. Closing the workspace or connection ends the SSH session.
- `POST /api/policies/:policyId/generate` renders, stores, and sends the policy plus linked policies with pending reflective changes to the selected switch.

## Run with Docker

1. Copy `.env.example` to `.env`.
2. Set a strong URL-safe PostgreSQL password and replace the sample switch in `SWITCHES_JSON` with the switch connection details. Compose builds the application's database URL from the PostgreSQL user, password, and database values. An optional `hostKeySha256` field pins a switch's SSH host key.
3. Start the stack with `docker compose up --build`.
4. Open `http://localhost:3000`.

The application container waits for PostgreSQL health, applies Prisma migrations on startup, and then starts the API and static frontend. The Terminal workspace uses xterm.js in the browser and an SSH pseudo-terminal on the server; switch credentials remain server-side. `postgres-data` persists database contents across container restarts. PostgreSQL initializes its credentials only when this volume is first created; changing `.env` later does not change the password stored in an existing volume. If the volume contains data you need, update the PostgreSQL role password to match `.env`. To discard all local database contents and initialize a fresh volume, run `docker compose down -v` before starting again.

## Local Development

Install Bun, create a PostgreSQL database, set `DATABASE_URL`, then install workspace dependencies with `bun install`. Run `bun run db:generate`, apply migrations with `bun run db:migrate`, and start the API using `bun run dev`. The frontend can be started separately with `bun run dev:web`; set Vite's API proxy target in `apps/web/vite.config.ts` if the backend is not on its default local port.
