// Types scoped to the Service & After-Sales feature.

export type TicketStatus = "open" | "in_progress" | "pending_parts" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface ServiceTicket {
  id: string;
  ticketNumber: string;
  customerId: string;
  unitSerial: string;       // Links to QR-tracked unit
  warrantyId?: string;
  issueDescription: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTechnicianId?: string;
  openedAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}
