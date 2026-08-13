# Mobilerun

Connect Cursor to the [Mobilerun](https://mobilerun.ai) cloud platform. The Mobilerun
MCP server lets the agent control real Android device fleets, provision phone numbers and
eSIMs, manage apps, and run automation workflows.

## Install

Install the plugin from the Cursor Marketplace. On first use Cursor opens a browser and
runs the OAuth login against `cloud.mobilerun.ai` — sign in with your Mobilerun account
and approve access. Cursor stores the credentials; there is no API key to copy.

## What it connects to

The plugin registers a single remote MCP server:

```json
{
  "mcpServers": {
    "mobilerun": {
      "url": "https://cloud.mobilerun.ai/api/mcp"
    }
  }
}
```

Authentication is OAuth 2.1 + PKCE with dynamic client registration — no configuration
required. Cursor discovers the authorization server from the endpoint and handles the flow.

## Capabilities

- **Devices** — list, control, and inspect Android devices in your fleet
- **Phone numbers & eSIMs** — provision, list, and manage connectivity
- **Apps** — browse and install apps onto devices
- **Workflows** — create and run automation workflows

## Support

Issues and questions: <https://github.com/droidrun/mobilerun-mcp/issues>
