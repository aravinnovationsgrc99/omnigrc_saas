# Google Workspace Integration Scaffold

This directory contains the structured stub implementation for the Google Workspace integration in OMNiGRC.

## Overview
The Google Workspace integration enables SAML/SSO user directory provisioning and automated Google Drive compliance evidence collection.

## OAuth 2.0 Scopes Required
To implement Google OAuth 2.0 authentication, register credentials in Google Cloud Console ([console.cloud.google.com](https://console.cloud.google.com)) with the following API scopes:

- `https://www.googleapis.com/auth/admin.directory.user.readonly` — Sync organization users and roles.
- `https://www.googleapis.com/auth/drive.readonly` — Attach Google Drive files as audit evidence to controls and compliance tasks.
- `https://www.googleapis.com/auth/userinfo.email` — Verify identity during OAuth flow.

## REST Endpoints & APIs to Consume
- Google Admin SDK Directory API: `GET https://admin.googleapis.com/admin/directory/v1/users`
- Google Drive REST API v3: `GET https://www.googleapis.com/drive/v3/files`
