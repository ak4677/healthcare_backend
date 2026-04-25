const mongoose = require("mongoose");
const { Schema } = mongoose;

const appointmentSchema = new Schema(
    {
        patient_id: {
            type: Schema.Types.ObjectId,
            ref: "patient",
            required: true
        },
        doctor_id: {
            type: Schema.Types.ObjectId,
            ref: "doctor",
            required: true
        },
        // 'normal'  → patient's assigned doctor only
        // 'emergency' → any available doctor, patient-chosen
        type: {
            type: String,
            enum: ["normal", "emergency"],
            default: "normal"
        },
        // Appointment slot
        scheduled_at: {
            type: Date,
            required: true
        },
        // Lifecycle: pending → confirmed → completed | cancelled
        status: {
            type: String,
            enum: ["pending", "confirmed", "completed", "cancelled"],
            default: "pending"
        },
        // 'chat' or 'video'  (emergency always video)
        consultation_type: {
            type: String,
            enum: ["chat", "video"],
            default: "video"
        },
        // Doctor's confirmation/rejection note
        doctor_note: {
            type: String,
            default: ""
        },
        // WebRTC room id — generated on confirm, used by both sides to join
        room_id: {
            type: String,
            default: null
        },
        // Patient's short reason for booking
        reason: {
            type: String,
            default: ""
        },
        // For emergency: patient-provided coords (used for distance sort on backend)
        patient_location: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null }
        }
    },
    { timestamps: true }
);

// Index to quickly find a doctor's upcoming appointments
appointmentSchema.index({ doctor_id: 1, scheduled_at: 1 });
// Index to quickly find a patient's appointments
appointmentSchema.index({ patient_id: 1, scheduled_at: -1 });

module.exports = mongoose.model("appointment", appointmentSchema);