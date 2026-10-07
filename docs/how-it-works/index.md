# How It Works

## How it works

Illinois Chat uses **retrieval-augmented generation (RAG)**:

1. **Ingest** — documents are split into overlapping chunks and converted into embeddings.
2. **Index** — embeddings are stored in a per-project vector index, isolated from other projects.
3. **Retrieve** — each question is embedded and matched against the index to find the most relevant passages.
4. **Generate** — the retrieved passages are passed to a large language model, which produces a cited answer.

Learn more in [Concepts → Retrieval](retrieval.md).

## RAG chat: what happens when you hit send?

1. The user submits a prompt.
    1. Determine whether tools should be invoked; if so, execute them and store the outputs.
2. Embed the user prompt with the embedding model.
3. Retrieve the most related documents from the vector database.
4. Prompt engineering to:
    1. pack as many documents as possible into the context window,
    2. retain as much conversation history as possible,
    3. include tool outputs and images,
    4. include user-configurable features (tutor mode, document references).
5. Send the final prompt to the LLM and stream the result.
    1. During streaming, a state machine replaces LLM citations with proper links — e.g. `[doc 1, page 3]` becomes a link to the document at the right page.
