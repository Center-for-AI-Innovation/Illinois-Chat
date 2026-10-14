# Tool Routing

When a chatbot has [tools](../building/tools/index.md), a model has to decide for each message whether a tool applies and with which arguments. This **router** is never the chat model the user picked; it is chosen from the chatbot's providers in a fixed order.

## The tiers

1. **The chatbot's OpenAI Compatible provider** — used when the user's selected model belongs to that provider; routing then runs against the same endpoint and model.
2. **The chatbot's OpenAI key** — when OpenAI is enabled on the [LLMs](../building/llms.md) page, routing uses that key with OpenAI's `gpt-4.1`.
3. **The hosted default router** — an NCSA-hosted model provided by the deployment, used when the chatbot has neither of the above.

If none of the three is available the chatbot is **Offline** for tools: conversations still work, but no tool is ever invoked.

## What the Tools page shows

The badge at the top of the **Tools** page tells you which tier is in effect:

| Badge | Meaning |
| --- | --- |
| **Custom router** | Tier 1 or 2 — one of the chatbot's own providers is routing. |
| **Default router** | Tier 3 — the deployment's hosted router. |
| **Offline** | No router available; add an OpenAI or OpenAI Compatible provider on the LLMs page. |

## For operators

The default tier exists only when the frontend has `NCSA_HOSTED_VLM_BASE_URL` set; `TOOL_ROUTER_MODEL_ID` selects the model, falling back to the platform's current default NCSA model. On the hosted site the default router is always available; on a self-hosted stack see the [Configuration reference](../self-hosting/configuration.md).
