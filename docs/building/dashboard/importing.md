# Importing

The import cards on your chatbot's **Dashboard** pull content in from other systems. Each card has a **Configure import** button; everything imported goes through the standard [ingest pipeline](../../how-it-works/documents-ingest.md) and becomes citable content.

## Canvas

Turn a Canvas course into a chatbot in one step: Illinois Chat bulk-imports your course content directly from Canvas.

What gets imported — pick any of: Files, Pages, Modules, Syllabus, Assignments, Discussions.

1. On the **Canvas** card choose **Configure import**.
2. Invite the account shown in the dialog to your Canvas course so it can read the course content.

    !!! warning "Bot invitation required"
        The import cannot see your course until that account has been added to it. The dialog shows the address to invite and the role to give it.

3. Enter your Canvas course URL and select which content types to import.
4. Click **Ingest Canvas Content**. Content is queued and ingested asynchronously — watch progress in Project Files.

[Watch the Canvas walkthrough :material-open-in-new:](../../getting-started/video-walkthroughs.md#connect-canvas){ .md-button }

Canvas ingestion is also available via the API — see the [Ingest API](../../api/ingest.md).

!!! tip "Tips for teaching assistants"
    - Combine the Canvas import with [Guided Learning](../prompting.md) so the chatbot guides students rather than giving away solutions.
    - Use [document groups](document-groups.md) to separate lecture materials from assignments.
    - Check the [Analysis](../analysis-exports.md) page to see what students actually ask.

## Website

Enter a starting URL and let the crawler discover and ingest linked pages. See [Web crawling](web-crawling.md).

## GitHub

Provide a public repository URL and click **Ingest GitHub Website** to ingest its contents — great for project-onboarding chatbots.

## Not yet available

The **MIT Course** and **Coursera** cards are shown as *Coming soon* and cannot be configured yet.
