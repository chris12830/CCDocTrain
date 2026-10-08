"use client";

import {FileCheck2, LockKeyhole} from 'lucide-react';
import {Button} from '@/components/ui/button';

const steps = [
  {title: 'Save as draft', text: 'Upload the document or media and describe what is new or has changed.'},
  {title: 'Review draft', text: 'Open Review draft to read, watch, or listen to the revision and check its changes.'},
  {title: 'Choose training', text: 'Choose required job roles, any additional staff, and their training deadlines.'},
  {title: 'Approve & release', text: 'Confirm your approval, then release the revision as the current controlled copy.'},
];

export default function DraftApprovalGuide({draftCount, onShowDrafts}: {draftCount: number; onShowDrafts: () => void}) {
  return <section className="panel draft-approval-guide" aria-labelledby="draft-approval-heading">
    <div className="draft-guide-heading">
      <div>
        <span className="section-kicker">DRAFT APPROVAL</span>
        <h2 id="draft-approval-heading">How to approve a draft</h2>
        <p>The business owner approves both documents and media in this workspace.</p>
      </div>
      <Button variant="outline" disabled={!draftCount} onClick={onShowDrafts}>
        <FileCheck2 size={17}/>{draftCount ? `Review drafts (${draftCount})` : 'No drafts awaiting approval'}
      </Button>
    </div>
    <ol className="draft-approval-steps">
      {steps.map((step, index) => <li key={step.title}>
        <span className="draft-step-number" aria-hidden="true">{index + 1}</span>
        <div><h3>{step.title}</h3><p>{step.text}</p></div>
      </li>)}
    </ol>
    <div className="draft-guide-footnote">
      <LockKeyhole size={16}/>
      <p>Drafts stay owner-only until approved. After release, staff with viewing access can use the current copy. Assigned staff must confirm they have reviewed and understood it; the approver’s name and approval date are recorded.</p>
    </div>
  </section>;
}

export function DraftReviewNotice({currentVersion}: {currentVersion?: number}) {
  return <section className="draft-review-notice" aria-label="Draft approval status">
    <FileCheck2 size={22}/>
    <div>
      <span className="approval-stage-label">STEP 2 OF 4 · OWNER REVIEW</span>
      <h3>Awaiting your approval</h3>
      <p>Review the content and revision summary below. Choose <strong>Continue to approval</strong> to set training requirements and confirm release, or <strong>Leave as draft</strong> if it is not ready.</p>
      {currentVersion && <p>Revision {currentVersion} remains the current released copy until this draft is approved.</p>}
    </div>
  </section>;
}
