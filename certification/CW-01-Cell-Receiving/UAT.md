# CW-01 — Cell Receiving: Factory User Acceptance Test

| Field | Value |
|-------|-------|
| **Wave** | CW-01 |
| **Module** | Cell Receiving |
| **UAT Date** | — |
| **Approver Name** | — |
| **Approver Role** | Director / Supervisor (circle one) |
| **Environment** | — |

---

## Purpose

The Factory UAT confirms that Cell Receiving behaves correctly against real-world manufacturing scenarios at OCS Oorja Green Pvt. Ltd. The approver must be a director or supervisor with direct knowledge of the cell receiving process.

---

## UAT Scenarios

| # | Scenario | Steps | Acceptance Criteria | Result | Status |
|---|----------|-------|---------------------|--------|--------|
| UAT-01 | Receive a new inbound cell lot from a supplier | 1. Navigate to Cell Receiving. 2. Create a new lot with supplier name, cell model, batch number, quantity, and received date. 3. Save. | Lot appears in list with correct details. Success notification shown. | | ⬜ |
| UAT-02 | Correct an error in a recently received lot | 1. Open the lot. 2. Edit the quantity and notes. 3. Save. | Corrected details reflected immediately. | | ⬜ |
| UAT-03 | Find a specific lot by supplier or batch number | 1. Use the search bar to search by supplier name. 2. Use filter to narrow by status. | Correct lots returned. Irrelevant lots hidden. | | ⬜ |
| UAT-04 | View the cell inventory after receiving a lot | 1. Receive a new lot. 2. Navigate to Cell Inventory. | Received count incremented by correct quantity. | | ⬜ |
| UAT-05 | Confirm that only authorised users can create lots | 1. Log in as a viewer-role user. 2. Attempt to create a lot. | Create option unavailable or blocked with a clear message. | | ⬜ |
| UAT-06 | Verify the Director Dashboard reflects the new lot | 1. Receive a new lot. 2. Open the Director Dashboard. 3. Check the cell inventory panel. | New lot is reflected in cell inventory counts. | | ⬜ |

---

## UAT Feedback

_Record any usability observations, workflow concerns, or improvement suggestions from the approver._

| # | Observation | Severity | Action |
|---|-------------|----------|--------|
| | | | |

---

## Approver Sign-Off

I confirm that I have participated in the Factory UAT for the **Cell Receiving** module and that the scenarios above were executed in the stated environment. The module meets the acceptance criteria for production use.

| Field | Value |
|-------|-------|
| **Approver Name** | |
| **Role** | |
| **Date** | |
| **Decision** | ☐ Accepted &nbsp;&nbsp; ☐ Rejected — see feedback above |
| **Conditions** | _(any conditions attached to acceptance, or "None")_ |

---

> A rejected UAT does not block fixing and re-running. Record the rejection reason above, file defects in `Defects.md`, fix, and reschedule UAT.
