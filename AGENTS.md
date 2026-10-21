# Project Guide

This repository contains a web application for managing VLANs, hosts, host groups, policies, and delivery of generated Extreme Networks policy files.

## Stack

- Vue 3, TypeScript, and Vite for the browser interface (`apps/web`).
- Bun and Elysia for the API and static asset server (`apps/server`).
- Prisma ORM with PostgreSQL for persistent application data.
- SSH/SFTP for sending generated `.pol` files to configured switches.
- Docker Compose runs the application and PostgreSQL database.

## Architecture and Documentation

Read [docs/architecture.md](docs/architecture.md) for the architecture, data model, API boundaries, ACL generation rules, environment setup, and Docker instructions.

Policies contain a user-provided description, a name generated from the selected VLAN, searchable host-or-group sources and destinations, optional protocol and port fields, and can contain multiple entries. Each VLAN can be assigned to at most one policy, and that assignment is immutable until the policy is deleted. Cross-VLAN destination entries create linked reflective entries in the existing destination VLAN policy, and generation sends linked policies with pending changes to the selected switch. The ACL formatter expands groups to their member hosts. Keep API routes, persistence, ACL formatting, and switch transport in separate modules. Avoid large all-purpose classes or modules. Write identifiers and code in English, use descriptive names, and add comments only when they clarify non-obvious behavior.

Hosts, groups, and policies each require a VLAN. VLANs have a unique name and numeric tag; IP, mask, and description are optional, with IP and mask supplied together. The GUI offers Light, Dark, Light Blue, and Dark Blue themes, plus a Terminal workspace that opens an interactive SSH CLI for configured switches. See [docs/architecture.md](docs/architecture.md) for the persistence, API, migration, terminal-session, and ACL details.

The Administration workspace exports and transactionally restores every database-backed record in a versioned JSON backup. Imports replace the current database records. PostgreSQL connection settings and switch credentials remain in `.env` and are not included in backups.

## Development Notes

- Copy `.env.example` to `.env`, then set database and switch credentials before starting with Docker Compose.
- The API never returns switch credentials to the browser.
- Prisma schema and migrations live in `apps/server/prisma/`.
- Browser code communicates with the API through `/api/*` endpoints.
