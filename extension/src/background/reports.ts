import type { ReportDraft } from '../shared/report';

/** One-use handoff. Raw screenshots never enter storage, tab URLs, clipboard or a server. */
export class ReportHandoff {
  private drafts = new Map<string, ReportDraft>();

  put(draft: ReportDraft): string {
    if (this.drafts.size >= 3) this.drafts.delete(this.drafts.keys().next().value!);
    const id = crypto.randomUUID();
    this.drafts.set(id, draft);
    setTimeout(() => this.drafts.delete(id), 60_000);
    return id;
  }

  take(id: string): ReportDraft | null {
    const draft = this.drafts.get(id) ?? null;
    this.drafts.delete(id);
    return draft;
  }
}
