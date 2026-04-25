const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

const appointment = require("../modules/appointment");
const doctor = require("../modules/doctor");
const assignment = require("../modules/assignment");
const authenticateUser = require("../middleware/authenticateUser");
const checkRole = require("../middleware/checkRole");

// ─────────────────────────────────────────────────────────────────────────────
// Haversine distance (km) between two lat/lng points
// ─────────────────────────────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/appointments/doctors/emergency
//
// Returns ALL activated doctors with availability status.
// If patient sends ?lat=&lng= query params, results are sorted by distance.
// Role: patient only
// ─────────────────────────────────────────────────────────────────────────────
router.get(
    "/doctors/emergency",
    authenticateUser,
    checkRole(["patient"]),
    async (req, res) => {
        try {
            const { lat, lng } = req.query;
            const patLat = parseFloat(lat);
            const patLng = parseFloat(lng);
            const hasCoords = !isNaN(patLat) && !isNaN(patLng);

            // All active doctors
            const allDoctors = await doctor.find(
                { isActivated: true },
                "name email Number"
            ).lean();

            const now = new Date();
            const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

            // For each doctor check if they have a confirmed appointment in the next 2 hours
            const doctorsWithStatus = await Promise.all(
                allDoctors.map(async (doc) => {
                    const busy = await appointment.exists({
                        doctor_id: doc._id,
                        status: "confirmed",
                        scheduled_at: { $gte: now, $lte: in2h }
                    });
                    return {
                        ...doc,
                        available: !busy,
                        // placeholder coords — real hospitals would store this on the doctor document
                        // For now we expose null and sort alphabetically if no coords given
                        lat: doc.lat || null,
                        lng: doc.lng || null,
                        distance_km: hasCoords && doc.lat && doc.lng
                            ? haversine(patLat, patLng, doc.lat, doc.lng)
                            : null
                    };
                })
            );

            // Sort: available first, then by distance if coords provided, then by name
            doctorsWithStatus.sort((a, b) => {
                if (a.available !== b.available) return a.available ? -1 : 1;
                if (a.distance_km !== null && b.distance_km !== null)
                    return a.distance_km - b.distance_km;
                return a.name.localeCompare(b.name);
            });

            return res.json(doctorsWithStatus);
        } catch (err) {
            console.error("[appointments] emergency list error:", err.message);
            return res.status(500).json({ error: "Server error" });
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/appointments/doctors/assigned
//
// Returns the doctor assigned to the logged-in patient (from assignment table)
// Role: patient only
// ─────────────────────────────────────────────────────────────────────────────
router.get(
    "/doctors/assigned",
    authenticateUser,
    checkRole(["patient"]),
    async (req, res) => {
        try {
            const assign = await assignment.findOne(
                { patient_id: req.user.id },
                "doctor_id"
            ).populate("doctor_id", "name email Number isActivated");

            if (!assign) {
                return res.status(404).json({ error: "No doctor assigned to you yet" });
            }
            return res.json(assign.doctor_id);
        } catch (err) {
            console.error("[appointments] assigned doctor error:", err.message);
            return res.status(500).json({ error: "Server error" });
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/appointments
//
// Book an appointment.
// Body: { doctor_id, scheduled_at, type, consultation_type, reason, patient_location? }
//
// Validation:
//  - normal: doctor_id must be the patient's assigned doctor
//  - emergency: any activated doctor is allowed
// Role: patient only
// ─────────────────────────────────────────────────────────────────────────────
router.post(
    "/",
    authenticateUser,
    checkRole(["patient"]),
    async (req, res) => {
        try {
            const {
                doctor_id,
                scheduled_at,
                type = "normal",
                consultation_type = "video",
                reason = "",
                patient_location
            } = req.body;

            if (!doctor_id || !scheduled_at) {
                return res.status(400).json({ error: "doctor_id and scheduled_at are required" });
            }

            const slotDate = new Date(scheduled_at);
            if (isNaN(slotDate.getTime()) || slotDate < new Date()) {
                return res.status(400).json({ error: "scheduled_at must be a valid future date" });
            }

            // For normal appointments, enforce assigned-doctor-only rule
            if (type === "normal") {
                const assign = await assignment.findOne({
                    patient_id: req.user.id,
                    doctor_id
                });
                if (!assign) {
                    return res.status(403).json({
                        error: "You can only book normal appointments with your assigned doctor"
                    });
                }
            }

            // Prevent double-booking the same slot (±30 min window)
            const windowStart = new Date(slotDate.getTime() - 30 * 60 * 1000);
            const windowEnd = new Date(slotDate.getTime() + 30 * 60 * 1000);
            const clash = await appointment.exists({
                doctor_id,
                status: { $in: ["pending", "confirmed"] },
                scheduled_at: { $gte: windowStart, $lte: windowEnd }
            });
            if (clash) {
                return res.status(409).json({
                    error: "Doctor already has an appointment in that time window (±30 min)"
                });
            }

            const newAppt = await appointment.create({
                patient_id: req.user.id,
                doctor_id,
                type,
                scheduled_at: slotDate,
                consultation_type: type === "emergency" ? "video" : consultation_type,
                reason,
                status: "pending",
                patient_location: patient_location || { lat: null, lng: null }
            });

            return res.status(201).json({
                message: "Appointment request sent. Awaiting doctor confirmation.",
                appointment: newAppt
            });
        } catch (err) {
            console.error("[appointments] book error:", err.message);
            return res.status(500).json({ error: "Server error" });
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/appointments/my
//
// Patient: their own appointments (upcoming first)
// Doctor:  appointments assigned to them (pending first)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
    "/my",
    authenticateUser,
    checkRole(["patient", "doctor"]),
    async (req, res) => {
        try {
            const query =
                req.user.role === "patient"
                    ? { patient_id: req.user.id }
                    : { doctor_id: req.user.id };

            const appts = await appointment
                .find(query)
                .populate("patient_id", "name Age sex email Number")
                .populate("doctor_id", "name email Number")
                .sort({ scheduled_at: 1 })
                .lean();

            return res.json(appts);
        } catch (err) {
            console.error("[appointments] fetch error:", err.message);
            return res.status(500).json({ error: "Server error" });
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/status
//
// Doctor confirms or rejects. On confirm: generate room_id for WebRTC.
// Body: { status: 'confirmed' | 'cancelled', doctor_note? }
// Role: doctor only
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
    "/:id/status",
    authenticateUser,
    checkRole(["doctor"]),
    async (req, res) => {
        try {
            const { status, doctor_note = "" } = req.body;

            if (!["confirmed", "cancelled"].includes(status)) {
                return res.status(400).json({ error: "status must be confirmed or cancelled" });
            }

            const appt = await appointment.findById(req.params.id);
            if (!appt) return res.status(404).json({ error: "Appointment not found" });

            // Ensure this doctor owns the appointment
            if (appt.doctor_id.toString() !== req.user.id) {
                return res.status(403).json({ error: "Forbidden" });
            }

            appt.status = status;
            appt.doctor_note = doctor_note;

            // Generate unique room id on confirmation — used by both sides for WebRTC
            if (status === "confirmed") {
                appt.room_id = uuidv4();
            }

            await appt.save();

            return res.json({
                message: `Appointment ${status}`,
                appointment: appt
            });
        } catch (err) {
            console.error("[appointments] status update error:", err.message);
            return res.status(500).json({ error: "Server error" });
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/complete
//
// Doctor marks a confirmed appointment as completed after the call ends.
// Role: doctor only
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
    "/:id/complete",
    authenticateUser,
    checkRole(["doctor"]),
    async (req, res) => {
        try {
            const appt = await appointment.findById(req.params.id);
            if (!appt) return res.status(404).json({ error: "Appointment not found" });
            if (appt.doctor_id.toString() !== req.user.id)
                return res.status(403).json({ error: "Forbidden" });
            if (appt.status !== "confirmed")
                return res.status(400).json({ error: "Only confirmed appointments can be completed" });

            appt.status = "completed";
            await appt.save();
            return res.json({ message: "Appointment marked complete" });
        } catch (err) {
            return res.status(500).json({ error: "Server error" });
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/appointments/:id
//
// Patient can cancel their own pending appointment.
// Role: patient only
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
    "/:id",
    authenticateUser,
    checkRole(["patient"]),
    async (req, res) => {
        try {
            const appt = await appointment.findById(req.params.id);
            if (!appt) return res.status(404).json({ error: "Appointment not found" });
            if (appt.patient_id.toString() !== req.user.id)
                return res.status(403).json({ error: "Forbidden" });
            if (appt.status !== "pending")
                return res.status(400).json({ error: "Only pending appointments can be cancelled" });

            appt.status = "cancelled";
            await appt.save();
            return res.json({ message: "Appointment cancelled" });
        } catch (err) {
            return res.status(500).json({ error: "Server error" });
        }
    }
);

module.exports = router;