/**
 * routes/consultation.js
 * =======================
 * Doctor ↔ Patient consultation: text chat + prescription upload.
 *
 * Mount in index.js:
 *   app.use('/api/consultation', require('./routes/consultation'));
 *
 * Endpoints:
 *   GET  /api/consultation/:patientId          — get or create consultation thread
 *   POST /api/consultation/:id/message         — save a message
 *   POST /api/consultation/:id/prescription    — doctor uploads prescription
 *   GET  /api/consultation/:id/prescriptions   — get all prescriptions for patient
 */

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const authenticateUser = require('../middleware/authenticateUser');
const checkRole        = require('../middleware/checkRole');
const consultation     = require('../modules/consultation');
const assignment       = require('../modules/assignment');

// ── Multer for prescription image uploads ─────────────────────────────────────
const prescriptionDir = path.join(__dirname, '../uploads/prescriptions');
if (!fs.existsSync(prescriptionDir)) fs.mkdirSync(prescriptionDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, prescriptionDir),
    filename:    (req, file, cb) => cb(null, `rx_${Date.now()}_${file.originalname}`),
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },  // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|pdf|webp/;
        cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
    },
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/consultation/:patientId
// Get or create the consultation thread between the calling user and the patient.
// Doctor: can access any patient assigned to them.
// Patient: can only access their own thread.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:patientId', authenticateUser, checkRole(['doctor', 'patient']), async (req, res) => {
    try {
        const { patientId } = req.params;

        let doctorId;
        let patientIdToUse;

        if (req.user.role === 'doctor') {
            doctorId      = req.user.id;
            patientIdToUse = patientId;

            // Verify this patient is assigned to this doctor
            const assigned = await assignment.findOne({ doctor_id: doctorId, patient_id: patientIdToUse });
            if (!assigned) return res.status(403).json({ error: 'This patient is not assigned to you' });

        } else {
            // Patient accessing their own thread
            patientIdToUse = req.user.id;
            const assigned = await assignment.findOne({ patient_id: patientIdToUse });
            if (!assigned) return res.status(404).json({ error: 'No doctor assigned yet' });
            doctorId = assigned.doctor_id;
        }

        // Find existing or create new consultation thread
        let thread = await consultation.findOne({ doctor_id: doctorId, patient_id: patientIdToUse })
            .populate('doctor_id',  'name email')
            .populate('patient_id', 'name email');

        if (!thread) {
            thread = await consultation.create({
                doctor_id:  doctorId,
                patient_id: patientIdToUse,
                room_id:    `chat_${doctorId}_${patientIdToUse}`,
                messages:   [],
                prescriptions: [],
            });
            thread = await consultation.findById(thread._id)
                .populate('doctor_id',  'name email')
                .populate('patient_id', 'name email');
        }

        return res.status(200).json(thread);
    } catch (err) {
        console.error('[consultation GET]', err.message);
        res.status(500).json({ error: 'Server error', detail: err.message });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/consultation/:id/message
// Save a chat message to the thread.
// Body: { text }
// Called by BOTH doctor and patient after Socket.io delivers the message.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/message', authenticateUser, checkRole(['doctor', 'patient']), async (req, res) => {
    try {
        const { text } = req.body;
        if (!text?.trim()) return res.status(400).json({ error: 'Message text is required' });

        const thread = await consultation.findById(req.params.id);
        if (!thread) return res.status(404).json({ error: 'Consultation thread not found' });

        // Verify this user belongs to this thread
        const belongsToThread =
            thread.doctor_id.toString()  === req.user.id ||
            thread.patient_id.toString() === req.user.id;
        if (!belongsToThread) return res.status(403).json({ error: 'Forbidden' });

        const message = {
            senderId:   req.user.id,
            senderName: req.body.senderName || 'User',
            senderRole: req.user.role,
            text:       text.trim(),
            timestamp:  new Date(),
        };

        await consultation.findByIdAndUpdate(
            req.params.id,
            { $push: { messages: message } }
        );

        return res.status(201).json({ message: 'Saved', data: message });
    } catch (err) {
        console.error('[consultation message]', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/consultation/:id/prescription
// Doctor uploads a prescription (typed text and/or image).
// Body: { text } (optional)  +  file field "image" (optional)
// Role: doctor only
// ─────────────────────────────────────────────────────────────────────────────
router.post(
    '/:id/prescription',
    authenticateUser,
    checkRole(['doctor']),
    upload.single('image'),
    async (req, res) => {
        try {
            const thread = await consultation.findById(req.params.id);
            if (!thread) return res.status(404).json({ error: 'Consultation thread not found' });

            if (thread.doctor_id.toString() !== req.user.id)
                return res.status(403).json({ error: 'Forbidden: you are not the doctor in this thread' });

            if (!req.body.text && !req.file)
                return res.status(400).json({ error: 'Provide prescription text, image, or both' });

            const imageUrl = req.file
                ? `/uploads/prescriptions/${req.file.filename}`
                : null;

            const prescription = {
                text:         req.body.text   || '',
                image_url:    imageUrl,
                issuedBy:     req.user.id,
                issuedByName: req.body.doctorName || 'Doctor',
                issuedAt:     new Date(),
                appointment_id: req.body.appointment_id || null,
            };

            await consultation.findByIdAndUpdate(
                req.params.id,
                { $push: { prescriptions: prescription } }
            );

            return res.status(201).json({
                message:      'Prescription saved',
                prescription,
            });
        } catch (err) {
            console.error('[consultation prescription]', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    }
);


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/consultation/:id/prescriptions
// Get all prescriptions in a thread.
// Both doctor and patient can view.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/prescriptions', authenticateUser, checkRole(['doctor', 'patient']), async (req, res) => {
    try {
        const thread = await consultation.findById(req.params.id).select('prescriptions doctor_id patient_id');
        if (!thread) return res.status(404).json({ error: 'Thread not found' });

        const belongs =
            thread.doctor_id.toString()  === req.user.id ||
            thread.patient_id.toString() === req.user.id;
        if (!belongs) return res.status(403).json({ error: 'Forbidden' });

        return res.status(200).json(thread.prescriptions);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});


module.exports = router;