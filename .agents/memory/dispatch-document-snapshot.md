---
name: Commercial-document master snapshot
description: Why issued commercial/legal documents must snapshot referenced master data instead of rendering it live.
---

Any issued, printable, or legally/commercially binding document (dispatch note, invoice, GRN, inspection cert) must **snapshot** the referenced master record's display fields into the document's own header row at creation time — not render them by joining the live master table at read time.

**Why:** the document is a frozen record of what was sent/agreed at that moment. If the dispatch note renders the dealer name/address/GST by joining `logistics_dealers` live, editing the dealer master later silently rewrites every historical note — an audit/compliance defect. Keep the relational `dealer_id` link for navigation, but the document's source of truth for rendering is its own snapshot columns.

**How to apply:** when building a document table, copy the human-facing master fields (name, code, address, tax id, contact) into the header at insert; serve detail/print from those columns. Relational id stays for joins/filters only. Verify by editing the master after issuing a doc and asserting the doc is unchanged.
