# Prompting

The **Prompting** screen shapes how your chatbot answers. It has a system prompt editor and a set of behaviour switches; each switch adds instructions to the prompt the model actually receives.

## System Prompt

Write the instructions the chatbot follows in every conversation — its persona, the course or domain, what it should refuse, how to format answers. Then:

- **Update System Prompt** saves your edits.
- **Optimize System Prompt** rewrites your draft with an LLM; it needs a provider enabled on the [LLMs](llms.md) page.
- **Prompt Builder** opens a guided editor that assembles a prompt from your answers to a few questions.
- **Prompt Engineering Guide** links to OpenAI's guide for writing good instructions.

## Document Search Optimization

- **Smart Document Search** — optimizes each question into a better search query before retrieval. Only the document search changes; the user's messages reach the model exactly as written.

## AI Behavior Settings

- **Guided Learning** — the chatbot encourages independent problem-solving with hints and questions instead of direct answers, while still finding and citing relevant materials. Enabled here, it applies to all users and they cannot switch it off.
- **Document-Based References Only** — restricts the chatbot to information from your documents; useful where outside knowledge could be a problem, such as legal research.
- **Hide citations in chat responses** — citations and sources are not shown on the chat screen.
- **Bypass Illinois Chat's internal prompting** — the platform normally adds instructions to cite sources and to be as helpful as possible; this switch sends your system prompt alone. A **Copy Illinois Chat's internal prompt** button gives you that internal text as a starting point; only its citation format works with the citation links in chat.
- **Enable Agent Mode** — runs a multi-step loop on the server that can search documents and call [tools](tools/index.md) repeatedly before writing the final answer. Users see an **Agent Mode** pill next to the model picker.

**Reset Prompting Settings** returns every switch to its default. **Generate Share Link** builds a link to the chatbot that turns on Guided Learning, Document-Based References Only or the prompting bypass for whoever opens it, even if the chatbot-wide switches change later.
