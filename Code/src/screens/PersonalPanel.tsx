import { RichEntriesPanel } from "./RichEntriesPanel";

export function PersonalPanel() {
  return (
    <RichEntriesPanel
      docKind="personal"
      fileCategory="personal"
      title="Personal"
      itemNoun="item"
      newButtonLabel="+ New personal item"
      entryTagLabel="Personal"
    />
  );
}
