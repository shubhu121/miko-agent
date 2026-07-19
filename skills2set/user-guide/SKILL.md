---
name: user-guide
description: "Plain-language guidance for using Miko. Use when the user asks how to use a feature, configure Miko, troubleshoot an everyday problem, or get started. MANDATORY TRIGGERS: how to use, user guide, help, getting started, tutorial, setup, settings, what is this feature."
---

# Miko User Guide

Use this skill to explain Miko in clear, practical language. Start with the answer the user needs, then give only the steps necessary to act. Avoid unexplained technical terms and never invent a setting or capability.

## What Miko is

Miko is a local-first personal AI companion for your computer. It can hold conversations, remember approved information, work with files in allowed folders, run tasks after approval, and organize work across independent Agents.

## Getting started

1. Open Miko and complete the welcome flow.
2. In **Settings > Providers**, add a model provider and the required credentials.
3. Return to the main window and start a conversation.
4. Choose a workspace folder when you want Miko to work with local files.

If a provider is not configured, explain that Miko needs a supported model and valid credentials before it can answer requests.

## Conversations

- Send a message with the send button or Enter.
- Use Shift+Enter for a line break.
- Attach files by dragging them into the conversation or using the attachment control.
- Stop a response with the stop control.
- Use `/new` to start a new conversation and `/compact` to reduce a long conversation while keeping its important context.

When a user asks about the access mode, explain it plainly:

- **Ask** lets Miko read safe information but asks before changes such as writing files or running commands.
- **Act** allows approved work to proceed without an extra prompt where the product permits it.
- **Read only** lets Miko inspect and explain without changing files or system state.

## Agents and memory

Each Agent has its own conversations, personality, settings, and memory. Users can create or switch Agents in **Settings > Agents**.

Memory can retain useful information across conversations. Tell users to review memory settings when Miko seems to forget something. Pinned memory is for facts that should not fade over time, such as a durable preference or project constraint.

## Workspace and previews

The Desk is Miko's workspace view. Select a workspace folder to browse files, attach them to a conversation, or open supported documents in the preview panel. Explain that Miko can access only the locations allowed by its sandbox and the current session's access mode.

## Skills, plugins, and connectors

- **Skills** are Markdown instructions that help Miko handle recurring kinds of work.
- **Plugins** can add tools, commands, and interface features.
- **Connectors** let Miko communicate with compatible external tools and services.

Direct users to the appropriate Settings page to install or enable these features. Remind them to review permissions before enabling third-party integrations.

## Automation

Users can create scheduled tasks for repeatable work. Before recommending automation, confirm the task, timing, workspace scope, and whether it can safely run unattended.

## Safety and privacy

Miko stores its data locally unless a configured provider or connector receives information as part of the user's request. The sandbox limits filesystem access, while the session access mode controls whether Miko may make changes. Explain both boundaries if the user asks why an action was blocked.

## Troubleshooting

- If Miko cannot answer, check the provider configuration and network connection.
- If a file cannot be opened, check the selected workspace, sandbox settings, and session access mode.
- If a plugin or connector does not work, confirm that it is enabled and that its required permissions and credentials are configured.
- If the desktop app fails to start, ask for the crash log or the exact error message.

When the answer depends on a current provider, plugin, or platform behavior, inspect the live configuration or official documentation rather than guessing.
