const express = require('express')
const router = express.Router()
const patientdata = require('../modules/patientdata')
const assignment = require('../modules/assignment')
const { body, validationResult } = require('express-validator')
const authenticateUser = require('../middleware/authenticateUser')
const checkRole = require('../middleware/checkRole')
const doctor = require('../modules/doctor')
const patient = require('../modules/patient')
const admin = require('../modules/admin')
const lab_assistant = require('../modules/lab_assistant')
const patient_lab = require('../modules/patient_lab')
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadPath = 'uploads/skin';
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

//fetch doctor throught /api/datatras/getinfo
router.post('/getinfo', authenticateUser, async (req, res) => {
    try {
        let user
        // console.log(req.user.role)
        switch (req.user.role) {
            case "patient":
                user = await patient.findById(req.user.id).select("-passward");
                // console.log(user)
                break;
            case "doctor":
                user = await doctor.findById(req.user.id).select("-passward");
                break;
            case "admin":
                user = await admin.findById(req.user.id).select("-passward");
                break;
            // case "receptionist":
            //     user = await Receptionist.findById(req.user.id).select("-passward");
            //     break;
            case "lab_assistant":
                user = await lab_assistant.findById(req.user.id).select("-passward");
                break;
            default:
                return res.status(400).json({ error: "Invalid role" });
        }

        if (!user) return res.status(404).json({ error: "User not found" });
        // console.log(req.user.id)
        res.status(200).json(user);
        // let status = false
        // const doctorId = req.doctor.id
        // getdoc = await doctor.findById(doctorId).select("-passward")
        // status = true
        // res.json(getdoc)
    } catch (error) {
        // console.error(error.message)
        res.status(400).send("interna getting doctor")
    }
})

//add patient data on /api/datatras/addpatient
router.post('/addpatient', authenticateUser, [
    body('name').isLength({ min: 6 }),
    body('Age').isLength({ min: 1 }, { max: 100 }),
    body('email').isEmail(),
    body('Number').isLength({ min: 10 }, { max: 10 })
], async (req, res) => {
    const result = validationResult(req)
    if (!result.isEmpty()) {
        return res.status(420).send("wrong cradential")
    }
    try {
        let newpatient = await patientdata.findOne({ email: req.body.email })
        if (newpatient) {
            return res.status(400).send("patient already exist")
        }
        newpatient = await patientdata.create({
            name: req.body.name,
            email: req.body.email,
            Number: req.body.Number,
            Age: req.body.Age,
            sex: req.body.sex,
            assindoc: req.doctor.id
        })
        const savepati = await newpatient.save()
        res.json(savepati);
    } catch (error) {
        console.error(error.message)
        res.status(400).send("internal server error in fatching patients")
    }
})


// GET /api/datatras/doctor/patients
// Get all patients assigned to the doctor with their medical data
router.get('/doctor/patients', authenticateUser, checkRole(['doctor']), async (req, res) => {
    try {
        // 1. Get the logged-in doctor's ID
        const doctorId = req.user.id;
        // console.log(doctorId);
        // 2. Find all assignments for this doctor
        const assignments = await assignment.find({ doctor_id: doctorId })
            .populate({
                path: 'patient_id',
                select: 'name Age sex email Number skinCancer liverCirrhosis cvd',
                model: 'patient'
            });

        // 3. Extract patient IDs from assignments
        const validAssignments = assignments.filter(a => a.patient_id);

        // Extract patient IDs
        const patientIds = validAssignments.map(a => a.patient_id._id);

        // 4. Get all medical data for these patients
        const medicalData = await patientdata.find({
            patient: { $in: patientIds }
        })

        // 5. Combine data into response format
        const response = validAssignments.map(assignment => {
            const patient = assignment.patient_id.toObject();
            const data = medicalData.filter(md =>
                md.patient.equals(patient._id)
            );

            return {
                ...patient,
                medical_history: data.map(d => ({
                    ...d.toObject(),
                    lab_assistant: d.lab_assistant
                }))
            };
        });

        res.status(200).json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching patients' });
    }
});


//admin get all the doctors on /api/datatras/admin/doctors
router.get("/admin/doctors", authenticateUser, checkRole(['admin']), async (req, res) => {
    try {
        const doctors = await doctor.find().select("-passward");
        if (!doctors) {
            res.status(404).json({ message: "doctor not found" })
        }
        res.status(200).json(doctors);
    } catch (error) {
        res.status(500).json({ error: "error in fetching doctors" })
    }
});


//admin get all the patients on /api/datatras/admin/patients
router.get("/admin/patients", authenticateUser, checkRole(['admin']), async (req, res) => {
    try {
        const patients = await patient.find().select("-passward");
        if (!patients) {
            res.status(404).json({ message: "patient not found" })
        }
        res.status(200).json(patients);
    } catch (error) {
        res.status(500).json({ error: "error in fetching patients" })
    }
})
//admin get all the patients on /api/datatras/admin/Assistant
router.get("/admin/Assistant", authenticateUser, checkRole(['admin']), async (req, res) => {
    try {
        const assistant = await lab_assistant.find().select("-passward");
        res.status(200).json(assistant);
    } catch (error) {
        res.status(500).json({ error: "error in fetching assistant" })
    }
})
// Admin Assignment Routes on api/datatras/assignments
router.get("/assignments", authenticateUser, checkRole(['admin']), async (req, res) => {
    try {
        let assignments = await assignment.find({ admin_id: req.user.id })
            .populate("doctor_id", "name Number")
            .populate("patient_id", "name Age");
        assignments = assignments.filter(a => a.doctor_id && a.patient_id);
        if (assignments.length === 0) {
            return res.status(200).json({ message: "No assignments found", data: [] });
        }
        res.status(200).json(assignments);
    } catch (err) {
        res.status(500).json({ error: "Server error in fetching assignment" });
    }
});

// Admin Assignment Routes on api/datatras/assignments
router.post("/assignments", authenticateUser, checkRole(['admin']), async (req, res) => {
    try {
        const { doctor_id, patient_id } = req.body;
        const newAssignment = await assignment.create({
            admin_id: req.user.id,
            doctor_id,
            patient_id
        });
        res.status(201).json(newAssignment);
    } catch (err) {
        res.status(500).json({ error: "Server error in creating assignment" });
    }
});

//admin delete assignment using api/datatras/deleteassignment/{id}
router.delete('/deleteassignment/:id', authenticateUser, checkRole(['admin']), async (req, res) => {
    try {
        let findassignment = await assignment.findById(req.params.id)
        if (!findassignment) { return res.status(404).send("assignment not found!") }
        if (findassignment.admin_id && findassignment.admin_id.toString() !== req.user.id) { return res.status(420).send("unauthorized person detected") }

        findassignment = await assignment.findByIdAndDelete(req.params.id)
        res.json({ "delete": "successuflly", assignment: findassignment })
    } catch (error) {
        console.error(error.message)
        res.status(400).send("some error occure in deleting assignment")
    }
})

router.delete('/delete/:id', authenticateUser, checkRole(['admin']), async (req, res) => {
    const roleModelMap = {
        'lab_assistant': lab_assistant,
        'doctor': doctor,
        'patient': patient
    };
    try {
        const role = req.body.role.toLowerCase();
        const Model = roleModelMap[role];
        let finduser = await Model.findById(req.params.id)
        if (!finduser) { return res.status(404).send("user not found!") }
        // if (finduser.admin_id && findassignment.admin_id.toString() !== req.user.id) { return res.status(420).send("unauthorized person detected") }

        finduser = await Model.findByIdAndDelete(req.params.id)
        res.json({ "delete": "successuflly", Model: finduser })
    } catch (error) {
        console.error(error.message)
        res.status(400).send("some error occure in deleting assignment")
    }
})

//doctor will get all the lab assitants via route /api/datatras/doctor/Assistant
router.get("/doctor/Assistant", authenticateUser, checkRole(['doctor']), async (req, res) => {
    try {
        const assistant = await lab_assistant.find().select("-passward");
        res.status(200).json(assistant);
    } catch (error) {
        res.status(500).json({ error: "error in fetching assistant via doctor" })
    }
})

// doctor will assign lab assistant to patient via route /api/datatras/doctor/assign-lab
router.post('/doctor/assign-lab', authenticateUser, checkRole(['doctor']), [
    body('patient').exists(),
    body('lab_assistant').exists()
], async (req, res) => {
    try {
        const result = validationResult(req)
        if (!result.isEmpty()) {
            return res.status(420).send("invalid credentials")
        }
        const foundpatient = await patient.findById(req.body.patient)
        if (!foundpatient) {
            return res.status(404).send("patient not found")
        }
        const labAssistant = await lab_assistant.findById(req.body.lab_assistant)
        if (!labAssistant) {
            return res.status(404).send("lab assistant not found")
        }
        const newAssignment = new patient_lab({
            doctor_id: req.user.id,
            patient_id: req.body.patient,
            lab_assistant: req.body.lab_assistant
        });
        const savedAssignment = await newAssignment.save();
        res.status(200).json({ message: "Lab assistant assigned successfully", data: savedAssignment });
    } catch (error) {
        console.error(error.message)
        res.status(400).send("some error occurred in assigning lab assistant")
    }
})

//doctor will delete the assigned lab to patient via route /api/datatras/doctor/deletelab
router.delete('/doctor/deletelab/:id', authenticateUser, checkRole(['doctor']), async (req, res) => {
    try {
        let findlab = await patient_lab.findById(req.params.id)
        if (!findlab) { return res.status(404).send("lab not found") }
        findlab = await patient_lab.findByIdAndDelete(req.params.id);
        res.status(200).json({ delete: "success fully", findlab })
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "error in deleting patient labassitant assignments" });
    }
})
//doctor will get all the assigned lab to patients via route /api/datatras/doctor/lab_assigned
router.get('/doctor/lab_assigned', authenticateUser, checkRole(['doctor']), async (req, res) => {
    try {
        const assignedlab = await patient_lab.find({ doctor_id: req.user.id }).populate("doctor_id", "name Number").populate("patient_id", "name Number").populate("lab_assistant", "name Number")
        res.status(200).json(assignedlab);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "error in fetching patient labassitant assignments" });
    }
})
// lab assistatant get all patient assigned to him via route /api/datatras/lab_assistant/patients
router.get('/lab_assistant/patients', authenticateUser, checkRole(['lab_assistant']), async (req, res) => {
    try {
        // 1. Get all patient_lab assignments for this lab assistant
        const assignments = await patient_lab
            .find({ lab_assistant: req.user.id })
            .populate('patient_id');

        if (!assignments || assignments.length === 0) {
            return res.status(200).json([]);
        }

        // 2. Collect all patient IDs from the assignments
        const patientIds = assignments
            .filter(a => a.patient_id)
            .map(a => a.patient_id._id);

        // 3. Fetch all patientdata records for these patients in one query
        //    (far more efficient than one query per patient)
        const allPatientData = await patientdata.find({
            patient: { $in: patientIds }
        });

        // 4. Attach the relevant patientData records to each assignment object
        //    so the frontend can read skinData, liverData, cvdData, predictions
        const result = assignments
            .filter(a => a.patient_id)   // drop any orphaned assignments
            .map(a => ({
                ...a.toObject(),
                patientData: allPatientData.filter(d =>
                    d.patient.equals(a.patient_id._id)
                )
            }));

        return res.status(200).json(result);
    } catch (error) {
        console.error('[lab_assistant/patients]', error.message);
        return res.status(500).json({
            error: 'Error fetching patients assigned to lab assistant'
        });
    }
})

// Lab Assistant Routes for uploading lab data
// POST /api/datatras/lab_assistant/upload
router.post('/lab_assistant/upload', authenticateUser, checkRole(['lab_assistant']), upload.array('images'), async (req, res) => {
    try {
        const foundpatient = await patient.findById(req.body.patient);
        if (!foundpatient) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        const newPatientData = new patientdata({
            lab_assistant: req.user.id,
            patient: req.body.patient
        });

        // Liver
        if (req.body.ascites) {
            newPatientData.liverData = {
                ascites: req.body.ascites,
                hepatome: req.body.hepatome,
                spiders: req.body.spiders,
                edema: req.body.edema,
                bilirubin: req.body.bilirubin,
                cholesterol: req.body.cholesterol,
                albumin: req.body.albumin,
                copper: req.body.copper,
                alk_phos: req.body.alk_phos,
                SGOT: req.body.SGOT,
                tryglicerides: req.body.tryglicerides,
                platelets: req.body.platelets,
                prothrombin: req.body.prothrombin
            };
        }

        // Skin - store ONLY file paths, predictions stays empty []
        if (req.files && req.files.length > 0) {
            newPatientData.skinData = {
                images: req.files.map(f => f.path),
                predictions: []
            };
        }

        // CVD
        if (req.body.age) {
            newPatientData.cvdData = {
                age: req.body.age,
                bloodPressure: req.body.bloodPressure,
                cholesterol: req.body.cholesterol,
                heartRate: req.body.heartRate,
                bloodSugar: req.body.bloodSugar
            };
        }

        const saved = await newPatientData.save();
        return res.status(200).json({
            message: 'Lab data uploaded successfully',
            data: saved
        });

    } catch (error) {
        console.error('[upload]', error.message);
        res.status(500).json({ error: 'Error uploading lab data', detail: error.message });
    }
})


// prediction route
// router.post("/:id/labdata", authenticateUser, checkRole(['doctor']), async (req, res) => {
//     try {
//         const patientId = req.params.id;
//         const labData = req.body; // JSON body from frontend
//         if (Array.isArray(labData)) {
//             labData = labData.at(-1);
//         }
//         if (!labData || Object.keys(labData).length === 0) {
//             return res.status(400).json({ success: false, message: "No data for prediction" });
//         }

//         // ✅ Enrich labData with default values required by the ML model
//         const enrichedData = {
//             ...labData,
//             ID: patientId,                 // Use Mongo _id as ID
//             N_Days: labData.N_Days || 0,   // default if not provided
//             Drug: labData.Drug || "D-penicillamine", // safe default
//             Age: labData.Age || 20000,     // approximate if age not in schema
//             Sex: labData.Sex || "F",       // default Female
//             Stage: labData.Stage || 3      // mid-stage default
//         };

//         // Call Python Flask API
//         const response = await fetch("http://localhost:5001/predict", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify(enrichedData),
//         });

//         const result = await response.json();
//         if (result.error) {
//             return res.status(500).json({ success: false, error: result.error });
//         }

//         // Save lab data + prediction in MongoDB
//         const updatedPatient = await patient.findByIdAndUpdate(
//             patientId,
//             {
//                 ...labData, // only keep actual patient schema fields
//                 prediction: result.prediction,
//                 risk_percentages: result.risk_percentages,
//             },
//             { new: true }
//         );

//         res.json({
//             success: true,
//             patient: updatedPatient,
//         });
//     } catch (err) {
//         console.error("Prediction failed:", err);
//         res.status(500).json({ success: false, error: "Prediction failed" });
//     }
// });
// POST /api/datatras/:patientDataId/predict/liver
router.post('/:patientDataId/predict/liver', authenticateUser, checkRole(['doctor']), async (req, res) => {
    try {
        const record = await patientdata
            .findById(req.params.patientDataId)
            .populate('patient', 'Age sex');

        if (!record) return res.status(404).json({ error: 'Patient data record not found' });

        const ld = record.liverData;
        if (!ld) return res.status(400).json({ error: 'No liver data found in this record' });

        // ── Map MongoDB field names → LiverInput schema names ──────────────
        // The lab assistant form stores raw strings; we parse them to floats.
        // Any field that is null/undefined is simply omitted — FastAPI/KNN imputes it.
        const payload = {};

        const add = (schemaKey, value) => {
            const f = parseFloat(value);
            if (!isNaN(f)) payload[schemaKey] = f;
        };

        // Patient demographics (from patient document)
        add('Age', record.patient?.Age);
        const sexMap = {
            M: 0, Male: 0,
            F: 1, Female: 1
        };
        add('Sex', sexMap[record.patient?.sex]);

        // Lab values — exact LiverInput field names
        add('Bilirubin', ld.bilirubin);
        add('Albumin', ld.albumin);
        add('AST', ld.SGOT);           // stored as SGOT in MongoDB
        add('ALT', ld.ALT);
        add('Alk_Phos', ld.alk_phos);
        add('Triglycerides', ld.tryglicerides);  // note: stored as tryglicerides
        add('Copper', ld.copper);
        add('Prothrombin', ld.prothrombin);
        add('Platelets', ld.platelets);

        // Symptoms — stored as 'Y'/'N' strings in MongoDB
        const yn = (v) => v === 'Y' || v === 'y' || v === '1' ? 1.0 : v === 'N' || v === 'n' || v === '0' ? 0.0 : undefined;
        const edemaMap = { 'N': 0, 'n': 0, '0': 0, 'S': 0.5, 's': 0.5, 'Y': 1, 'y': 1, '1': 1 };

        const ascites = yn(ld.ascites);
        const hepatome = yn(ld.hepatome);
        const spiders = yn(ld.spiders);
        const edema = edemaMap[ld.edema];

        if (ascites !== undefined) payload['Ascites'] = ascites;
        if (hepatome !== undefined) payload['Hepatomegaly'] = hepatome;
        if (spiders !== undefined) payload['Spiders'] = spiders;
        if (edema !== undefined) payload['Edema'] = edema;

        // ── Call FastAPI ──────────────────────────────────────────────────
        const FASTAPI_LIVER = process.env.FASTAPI_LIVER || 'http://localhost:8002';

        const fastapiRes = await fetch(`${FASTAPI_LIVER}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30000),
        });

        if (!fastapiRes.ok) {
            const errText = await fastapiRes.text();
            return res.status(502).json({ error: 'Liver ML service error', detail: errText });
        }

        const result = await fastapiRes.json();

        // ── Save prediction results back to MongoDB ───────────────────────
        await patientdata.findByIdAndUpdate(
            req.params.patientDataId,
            {
                $set: {
                    'liverData.prediction': result.prediction,
                    'liverData.decision': result.decision,
                    'liverData.risk_label': result.risk_label,
                    'liverData.risk_probability': result.risk_probability,
                    'liverData.risk_percentage': result.risk_percentage,
                    'liverData.top_features': result.top_features,
                    'liverData.clinical_flags': result.clinical_flags,
                    'liverData.shap_bar_chart': result.shap_bar_chart,
                    'liverData.shap_waterfall': result.shap_waterfall,
                    'liverData.gauge_chart': result.gauge_chart,
                    'liverData.model_used': result.model_used,
                    'liverData.threshold_used': result.threshold_used,
                    'liverData.predictedAt': new Date(),
                }
            },
            { new: true }
        );

        return res.status(200).json({
            message: 'Liver prediction complete',
            prediction: result.prediction,
            decision: result.decision,
            risk_label: result.risk_label,
            risk_probability: result.risk_probability,
            risk_percentage: result.risk_percentage,
            top_features: result.top_features,
            clinical_flags: result.clinical_flags,
            shap_bar_chart: result.shap_bar_chart,
            shap_waterfall: result.shap_waterfall,
            gauge_chart: result.gauge_chart,
            model_used: result.model_used,
            threshold_used: result.threshold_used,
        });

    } catch (err) {
        console.error('[liver predict]', err.message);
        res.status(500).json({ error: 'Liver prediction failed', detail: err.message });
    }
});


// POST /api/datatras/:patientDataId/predict/basic
router.post('/:patientDataId/predict/basic', authenticateUser, checkRole(['doctor']), async (req, res) => {
    try {
        const record = await patientdata
            .findById(req.params.patientDataId)
            .populate('patient', 'Age sex');
        console.log(record)
        if (!record) return res.status(404).json({ error: 'Patient data record not found' });

        const bd = record.basicHealthData;
        if (!bd) return res.status(400).json({ error: 'No basic health data found in this record' });

        const FASTAPI_BASIC = process.env.FASTAPI_BASIC || 'http://localhost:8004';

        // ── Build the TabularRequest payload ─────────────────────────────
        // Map whatever the lab assistant uploaded into the expert panel schemas.
        // Any field not present is simply omitted — the model handles NaN via imputer.

        const payload = {};

        // CBC panel
        const cbcFields = {};
        if (bd.WBC != null) cbcFields.WBC = parseFloat(bd.WBC);
        if (bd.HGB != null) cbcFields.HGB = parseFloat(bd.HGB);
        if (bd.HCT != null) cbcFields.HCT = parseFloat(bd.HCT);
        if (bd.PLT != null) cbcFields.PLT = parseFloat(bd.PLT);
        if (bd.RBC != null) cbcFields.RBC = parseFloat(bd.RBC);
        if (bd.MCV != null) cbcFields.MCV = parseFloat(bd.MCV);
        if (bd.MCH != null) cbcFields.MCH = parseFloat(bd.MCH);
        if (bd.MCHC != null) cbcFields.MCHC = parseFloat(bd.MCHC);
        if (bd.RDW != null) cbcFields.RDW = parseFloat(bd.RDW);
        if (bd.MPV != null) cbcFields.MPV = parseFloat(bd.MPV);
        if (Object.keys(cbcFields).length > 0) payload.cbc = cbcFields;

        // Kidney panel
        const kidneyFields = {};
        if (bd.bp != null) kidneyFields.bp = parseFloat(bd.bp);
        if (bd.sc != null) kidneyFields.sc = parseFloat(bd.sc);
        if (bd.hemo != null) kidneyFields.hemo = parseFloat(bd.hemo);
        if (bd.bu != null) kidneyFields.bu = parseFloat(bd.bu);
        if (bd.bgr != null) kidneyFields.bgr = parseFloat(bd.bgr);
        if (bd.sod != null) kidneyFields.sod = parseFloat(bd.sod);
        if (record.patient?.Age) kidneyFields.age = record.patient.Age;
        if (Object.keys(kidneyFields).length > 0) payload.kidney = kidneyFields;

        // Liver panel (basic version — not the cirrhosis model)
        const liverFields = {};
        if (bd.total_bilirubin != null) liverFields.total_bilirubin = parseFloat(bd.total_bilirubin);
        if (bd.albumin_basic != null) liverFields.albumin = parseFloat(bd.albumin_basic);
        if (bd.alk_phosphotase != null) liverFields.alk_phosphotase = parseFloat(bd.alk_phosphotase);
        if (bd.total_proteins != null) liverFields.total_proteins = parseFloat(bd.total_proteins);
        if (record.patient?.sex != null) liverFields.gender = record.patient.sex === 'M' ? 1 : 0;
        if (record.patient?.Age != null) liverFields.age = record.patient.Age;
        if (Object.keys(liverFields).length > 0) payload.liver = liverFields;

        // Urinalysis panel
        const urineFields = {};
        if (bd.ph != null) urineFields.ph = parseFloat(bd.ph);
        if (bd.specific_gravity != null) urineFields.specific_gravity = parseFloat(bd.specific_gravity);
        if (bd.glucose_urine != null) urineFields.glucose = parseFloat(bd.glucose_urine);
        if (bd.protein_urine != null) urineFields.protein = parseFloat(bd.protein_urine);
        if (bd.blood_urine != null) urineFields.blood = parseFloat(bd.blood_urine);
        if (Object.keys(urineFields).length > 0) payload.urine = urineFields;

        // ECG signal (optional — 187 samples stored as array in MongoDB)
        if (Array.isArray(bd.ecg_signal) && bd.ecg_signal.length === 187) {
            payload.ecg_signal = bd.ecg_signal.map(Number);
        }

        if (Object.keys(payload).length === 0) {
            return res.status(400).json({ error: 'No usable basic health data fields found' });
        }

        // ── Call FastAPI /predict/tabular ─────────────────────────────────
        const fastapiRes = await fetch(`${FASTAPI_BASIC}/predict/tabular`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30000),
        });

        if (!fastapiRes.ok) {
            const errText = await fastapiRes.text();
            return res.status(502).json({ error: 'Basic health ML service error', detail: errText });
        }

        const result = await fastapiRes.json();

        // ── Save prediction results back to MongoDB ───────────────────────
        await patientdata.findByIdAndUpdate(
            req.params.patientDataId,
            {
                $set: {
                    'basicHealthData.health_score': result.health_score,
                    'basicHealthData.risk_tier': result.risk_tier,
                    'basicHealthData.gate_weights': result.gate_weights,
                    'basicHealthData.expert_results': result.expert_results,
                    'basicHealthData.ecg_result': result.ecg_result,
                    'basicHealthData.clinical_flags': result.clinical_flags,
                    'basicHealthData.gauge_chart': result.gauge_chart,
                    'basicHealthData.breakdown_chart': result.breakdown_chart,
                    'basicHealthData.radar_chart': result.radar_chart,
                    'basicHealthData.predictedAt': new Date(),
                }
            },
            { new: true }
        );

        return res.status(200).json({
            message: 'Basic health assessment complete',
            health_score: result.health_score,
            risk_tier: result.risk_tier,
            expert_results: result.expert_results,
            ecg_result: result.ecg_result,
            clinical_flags: result.clinical_flags,
            gauge_chart: result.gauge_chart,
            breakdown_chart: result.breakdown_chart,
            radar_chart: result.radar_chart,
        });

    } catch (err) {
        console.error('[basic health predict]', err.message);
        res.status(500).json({ error: 'Basic health prediction failed', detail: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Optional: separate route for X-ray upload (multipart)
// POST /api/datatras/:patientDataId/predict/xray
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:patientDataId/predict/xray', authenticateUser, checkRole(['doctor']),
    upload.single('xray'),   // reuse your existing multer instance
    async (req, res) => {
        try {
            const FASTAPI_BASIC = process.env.FASTAPI_BASIC || 'http://localhost:8004';

            if (!req.file) return res.status(400).json({ error: 'No X-ray image uploaded' });

            const fs = require('fs');
            const FormData = require('form-data');

            const form = new FormData();
            form.append('file', fs.createReadStream(req.file.path), req.file.originalname);

            const fastapiRes = await fetch(`${FASTAPI_BASIC}/predict/xray`, {
                method: 'POST',
                headers: form.getHeaders(),
                body: form,
                signal: AbortSignal.timeout(30000),
            });

            if (!fastapiRes.ok) {
                const errText = await fastapiRes.text();
                return res.status(502).json({ error: 'X-ray ML service error', detail: errText });
            }

            const result = await fastapiRes.json();

            await patientdata.findByIdAndUpdate(
                req.params.patientDataId,
                { $set: { 'basicHealthData.xray_result': result, 'basicHealthData.predictedAt': new Date() } },
                { new: true }
            );

            return res.status(200).json({ message: 'X-ray prediction complete', ...result });

        } catch (err) {
            console.error('[xray predict]', err.message);
            res.status(500).json({ error: 'X-ray prediction failed', detail: err.message });
        }
    }
);


//patient get its own data 
router.get("/patient", authenticateUser, checkRole('patient'), async (req, res) => {
    try {
        // fetch all medical history documents of this patient
        const userInfo = await patient.findById(req.user.id).select("name prediction risk_percentages");
        const histories = await patientdata.find({ patient: req.user.id }).sort({ _id: -1 })
        const doc = await assignment.findOne({ patient_id: req.user.id }).populate({
            path: 'doctor_id',
            select: 'name email Number',
            model: 'doctor'
        });
        // console.log(doc);
        if (!histories || !userInfo || histories.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Patient data not available",
            });
        }

        const doctorInfo = doc?.doctor_id
            ? {
                name: doc.doctor_id.name,
                email: doc.doctor_id.email,
                number: doc.doctor_id.Number,
            }
            : null;
        // build response in the same shape your frontend expects
        const responseData = {
            _id: req.user.id,
            name: userInfo.name,
            prediction: userInfo.prediction ?? 0,
            risk_percentages: userInfo.risk_percentages ?? [0, 0, 0],
            medical_history: histories, // return full array of history docs
            doctor: doctorInfo
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error("Prediction failed:", error);
        res.status(500).json({ success: false, error: "error in fetching patient data by own" });
    }
})
module.exports = router;