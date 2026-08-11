/**
 * Stamps & Marks (F-4, F-5, F-6, F-10) — one dock panel, five jobs, one at a
 * time. Only the open section registers its preview overlay, so the page never
 * carries a watermark preview while the attorney is placing a signature.
 *
 * The body is keyed by document id, so switching tabs starts clean.
 */

import { useState } from 'react';
import type { ComponentType } from 'react';
import type { DocumentSession } from '@shared/types';
import { useActiveSession } from '@renderer/app/store';
import { SignatureSection } from '@renderer/features/signature';
import { ExhibitSection } from './exhibit-section';
import { PageNumberSection } from './page-number-section';
import { EmptyPanel, Problem, Receipt, Working } from './stamp-views';
import { TextSection } from './text-section';
import { useStampRunner, type StampRunner } from './use-stamp-runner';
import { WatermarkSection } from './watermark-section';

export interface StampSectionProps {
  session: DocumentSession;
  runner: StampRunner;
}

interface StampTab {
  id: string;
  label: string;
  section: ComponentType<StampSectionProps>;
}

const TABS: readonly StampTab[] = [
  { id: 'exhibit', label: 'Exhibit', section: ExhibitSection },
  { id: 'watermark', label: 'Watermark', section: WatermarkSection },
  { id: 'numbers', label: 'Numbers', section: PageNumberSection },
  { id: 'signature', label: 'Signature', section: SignatureSection },
  { id: 'text', label: 'Text', section: TextSection },
];

function TabBar({ active, onSelect }: { active: string; onSelect(id: string): void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-armory-border p-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={tab.id === active}
          onClick={() => onSelect(tab.id)}
          className={`rounded-md px-2 py-1 text-xs transition-colors duration-150 ${
            tab.id === active
              ? 'bg-armory-interactive text-brand-300'
              : 'text-text-muted hover:bg-armory-interactive hover:text-text-primary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function StampsBody({ session }: { session: DocumentSession }) {
  const runner = useStampRunner(session.id);
  const [activeId, setActiveId] = useState(TABS[0]?.id ?? 'exhibit');
  const active = TABS.find((tab) => tab.id === activeId) ?? TABS[0];
  const Section = active?.section ?? ExhibitSection;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar active={activeId} onSelect={setActiveId} />
      <div className="flex flex-col gap-2 p-3">
        <Section key={activeId} session={session} runner={runner} />

        {runner.error !== null && <Problem message={runner.error} />}
        {runner.busy !== null && <Working label={runner.busy} progress={runner.progress} />}
        {runner.receipt !== null && <Receipt message={runner.receipt} />}
      </div>
    </div>
  );
}

export function StampsPanel() {
  const session = useActiveSession();
  if (session === null) {
    return (
      <EmptyPanel
        title="No document open."
        summary="Open a PDF to add exhibit stamps, watermarks, page numbers, signatures, or text."
      />
    );
  }
  return <StampsBody key={session.id} session={session} />;
}
