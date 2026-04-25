/**
 * modules/consultation.js
 * ========================
 * Stores the doctor-patient consultation thread:
 *   - Real-time text messages (persisted after Socket.io delivery)
 *   - Prescription (typed text or uploaded image)
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Single message ─────────────────────────────────────────────────────────────
const messageSchema = new Schema({
    senderId:   { type: Schema.Types.ObjectId, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, enum: ['doctor', 'patient'], required: true },
    text:       { type: String, default: '' },
    timestamp:  { type: Date, default: Date.now },
}, { _id: true });

// ── Prescription ───────────────────────────────────────────────────────────────
const prescriptionSchema = new Schema({
    // Typed prescription text (markdown supported)
    text:        { type: String, default: '' },
    // Uploaded prescription image (Cloudinary URL or local path)
    image_url:   { type: String, default: null },
    // Doctor who issued it
    issuedBy:    { type: Schema.Types.ObjectId, ref: 'doctor', required: true },
    issuedByName: { type: String },
    issuedAt:    { type: Date, default: Date.now },
    // Optional: appointment this prescription belongs to
    appointment_id: { type: Schema.Types.ObjectId, ref: 'appointment', default: null },
}, { _id: true });

// ── Main consultation document ─────────────────────────────────────────────────
const consultationSchema = new Schema({
    doctor_id:  { type: Schema.Types.ObjectId, ref: 'doctor',  required: true },
    patient_id: { type: Schema.Types.ObjectId, ref: 'patient', required: true },

    // All messages in this thread (appended in real time)
    messages: [messageSchema],

    // All prescriptions issued in this thread
    prescriptions: [prescriptionSchema],

    // The Socket.io room ID for this thread
    // Format: "chat_<doctorId>_<patientId>"
    room_id: { type: String },

    // Whether this consultation is still open
    is_active: { type: Boolean, default: true },

}, { timestamps: true });

// Index for fast lookup by doctor+patient pair
consultationSchema.index({ doctor_id: 1, patient_id: 1 });

module.exports = mongoose.model('consultation', consultationSchema);