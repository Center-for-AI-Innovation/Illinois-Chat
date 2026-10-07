# CropWizard

CropWizard is a cutting-edge AI agronomy assistant that answers agricultural questions with expert precision. It consults over 400,000 selected online publications, including Extension resources from US land-grant universities and a growing set of open-access research publications. It can be used as:

- **a "virtual agronomist"** — to obtain farming advice;
- **a research assistant** — to find the most relevant online publications for a topic of interest;
- **a search engine** — to look up basic information about agriculture.

CropWizard is built on the Illinois Chat platform and is its flagship example of a large, specialized assistant.

## Getting started

Enter a text question in the chat bar at the bottom of the Chat page and you'll receive a response within a few seconds. You can also upload one or more images and ask about them, or ask questions that trigger registered computational tools — tools are invoked automatically when relevant.

The tools functionality can also analyze your own data, including spreadsheets (CSV) and databases (SQL); this is preliminary — contact support using the address in the page footer if you're interested.

## Customizing user settings

The chat screen works like every Illinois Chat chatbot — model picker, **Settings** (Model, Document Groups, Tools), conversation history, **Export history** and **Clear conversations** — see [Using a chatbot](../../getting-started/using-a-chatbot.md). Two CropWizard specifics:

- **Document Groups** are organised by university for Extension documents and by publisher for research publications; "All Documents" is enabled by default.
- **Export history** downloads your conversations as a zip of Markdown files.

## Text questions and references

Responses cite reference numbers; click **Sources** at the bottom of a response to see the numbered reference list, where each entry links to the original online source. Depending on the question, CropWizard displays intermediate steps you can expand:

- **Optimized search query** — for follow-up questions, an LLM compresses the combined history + question into an efficient search query.
- **Retrieved documents** — how many relevant document chunks were included (always shown).
- **Routing to tools** — which computational tools were deemed relevant (invoked in parallel).
- **Tool outputs** — output from any invoked tools, combined with retrieved chunks and images for the final answer.
- **Final response** — the answer, synthesizing the prompt, retrieved documents, and tool outputs.

## CropWizard as a research assistant

Enter a research topic as your prompt; the cited source documents give you relevant material to explore in detail. Use follow-up questions to dig into facets of the topic — previous questions and answers are retained as context.

!!! success "Example"
    *Give me a detailed explanation of hairy vetch as a cover crop. Explain when it must be planted, what size range it grows to, how fast it grows to maturity, and the best ways to clear the field for planting in the next season.*

## Image questions

Upload images with the photo icon at the left of the chat bar and ask about them. For image questions, CropWizard additionally shows an **Image description** step — an LLM-generated description of the image contents, which is also used to search the knowledge base.

## Tool questions

Upload pest images and ask a question, or share a link to a list of field trials and ask about the growing season; the AI automatically invokes the relevant tools, such as the [Pest Detection tool](pest-detection.md) and the [Seasonal Characterization tool](seasonal-characterization.md). Tool inputs and outputs (text and images) are displayed as steps and folded into the final answer. See [Tools & Workflows](../../building/tools/index.md) for how tools work platform-wide.

## Example questions

> What are the best practices for crop rotation in corn production?
>
> How can I manage pests in my soybean field?
>
> What are the nutrient requirements for wheat during the growing season?
>
> How do I improve soil fertility with cover crops?
>
> What irrigation techniques work best in drought-prone areas?

## Funding and acknowledgements

CropWizard is a research project launched as part of **AIFARMS**, the national AI institute for agriculture, funded by USDA NIFA under award number 2020-67021-32799. Additional funding comes from **Intel** Corporation, Amazon AWS through the **Amazon-Illinois Center on AI for Conversational Experiences (AICE)**, and the University of Illinois system through the **Discovery Partners Institute** Science program.

CropWizard is built on the **Illinois Chat** platform, funded by the NCSA [Center for AI Innovation (CAII)](https://ai.ncsa.illinois.edu/), the [Office of the CIO](https://cio.illinois.edu/) of the University of Illinois Urbana-Champaign, the [Healthcare Innovation Program Office](https://www.ncsa.illinois.edu/research/health-sciences/healthcare-innovation-program-office/) at NCSA, and the [Gies College of Business](https://giesbusiness.illinois.edu/), among others.
