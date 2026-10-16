# Document Groups & Deleting

## Document groups

Documents can be organized into **groups** (for example "Lectures", "Homework solutions", "Research papers") from the Project Files table on the **Dashboard**. Every document also belongs to the built-in **All Documents** group.

Users can switch groups on and off in the chat **Settings › Document Groups** tab to scope retrieval to a subset of the knowledge base, and the [Retrieval API](../../api/retrieval.md) and [Chat API](../../api/chat.md) accept a `doc_groups` filter.

## Deleting documents

Delete a document from the Project Files table. Deleting removes it from future retrieval and updates the group counts; citations that already appeared in past conversations remain visible.
