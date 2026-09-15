/**
 * The strip under the last thumbnail. A virtualized list has no gap after its
 * final row to drop into, so "move these pages to the end" needs a target of
 * its own — and saying so in words is clearer than an invisible hot zone.
 */

interface EndDropZoneProps {
  active: boolean;
  onOver(): void;
  onDrop(): void;
}

export function EndDropZone({ active, onOver, onDrop }: EndDropZoneProps) {
  return (
    <div
      data-end-drop-zone
      onDragOver={(event) => {
        event.preventDefault();
        onOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={`m-2 rounded-md border border-dashed py-2 text-center text-xs transition-colors duration-150 ${
        active ? 'border-brand-500 text-brand-400' : 'border-armory-border text-text-muted'
      }`}
    >
      Drop here to move to the end
    </div>
  );
}
