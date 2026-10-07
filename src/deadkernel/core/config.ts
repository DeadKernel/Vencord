/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Where DeadKernel talks to, in one place. Only native.ts uses these URLs.

/** PostHog project key (phc_…): public and write-only by design, safe to ship in the client.
 * Empty = telemetry never sends, whatever the setting says. */
export const POSTHOG_KEY = "phc_rWqxLLG3EwZZNAbeKiMg2hBecxZarovM98nV8rseGdFo";
export const POSTHOG_HOST = "https://us.i.posthog.com";

/** Announcements for everyone running a DeadKernel build (personal/RELEASING.md). */
export const NOTICES_URL = "https://raw.githubusercontent.com/DeadKernel/Vencord/dk-notices/notices.json";
