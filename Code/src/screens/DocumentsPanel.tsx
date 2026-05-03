import { RichEntriesPanel } from "./RichEntriesPanel";

export function DocumentsPanel() {
  return (
    <RichEntriesPanel
      docKind="documents"
      fileCategory="documents"
      title="Documents"
      itemNoun="item"
      newButtonLabel="+ New document"
      entryTagLabel="Document"
      honourPendingDocumentId
    />
  );
}
