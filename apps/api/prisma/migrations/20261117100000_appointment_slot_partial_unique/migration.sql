-- A cancelled appointment keeps its slotId (history, ICS), but the slot becomes bookable again.
-- Uniqueness therefore only applies to live (non-cancelled) appointments.
DROP INDEX "Appointment_slotId_key";
CREATE INDEX "Appointment_slotId_idx" ON "Appointment"("slotId");
CREATE UNIQUE INDEX "Appointment_slotId_live_key" ON "Appointment"("slotId") WHERE "status" <> 'CANCELLED';
