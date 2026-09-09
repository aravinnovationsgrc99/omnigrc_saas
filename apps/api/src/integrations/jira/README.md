# Jira Cloud Integration Scaffold

This directory contains the structured stub implementation for the Jira Cloud integration in OMNiGRC.

## Overview
The Jira integration allows OMNiGRC Compliance Tasks and Risks to automatically sync bidirectional status updates with Jira Software issues.

## OAuth 2.0 Scopes Required
To implement real 3-Legged OAuth (3LO) with Atlassian Identity, register an Atlassian App at [developer.atlassian.com](https://developer.atlassian.com) with the following scopes:

- `read:jira-work` — View Jira issues, projects, and custom fields.
- `write:jira-work` — Create and transition Jira issues.
- `read:jira-user` — Resolve Jira user account IDs.
- `offline_access` — Obtain refresh tokens for background task synchronization.

## REST Endpoints to Implement
- `GET /rest/api/3/project` — Fetch candidate Jira projects for compliance sync.
- `POST /rest/api/3/issue` — Convert OMNiGRC ComplianceTask to Jira Issue.
- `POST /rest/api/3/issue/{issueIdOrKey}/transitions` — Transition issue status when ComplianceTask status updates.
