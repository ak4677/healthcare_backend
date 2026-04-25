const express = require("express");
const doctor = require('../modules/doctor')
const admin = require('../modules/admin')
const Lab_assistant = require('../modules/lab_assistant')
const { body, validationResult } = require('express-validator')
const router = express.Router();
const jwt = require('jsonwebtoken');
const fetchpatient = require("../middleware/authenticateUser");
const patientdata = require("../modules/patientdata");
const patient = require("../modules/patient");
const lab_assistant = require("../modules/lab_assistant");
const checkRole = require("../middleware/checkRole");
const authenticateUser = require("../middleware/authenticateUser");
const bcrypt = require("bcrypt");
const axios = require("axios");
const doc_secret_signature = process.env.DOCTOR_SECRET_SIGNATURE
const pati_secret_signature = process.env.PATIENT_SECRET_SIGNATURE


//verify admin
router.post("/verify-admin-key", async (req, res) => {
    const { key } = req.body;

    const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;

    if (key === ADMIN_SECRET_KEY) {
        return res.json({ valid: true });
    }

    res.status(401).json({ valid: false });
});

//doctor accont creation on /api/auth/createadmin
router.post('/createadmin', [
    body('name').isLength({ min: 6 }),
    body('passward').isLength({ min: 4 }).exists(),
    body('email').isEmail(),
    body('Number').isLength({ min: 10 }, { max: 10 })
], async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(420).send("wronge cradential")
    }
    try {
        let newadmin = await admin.findOne({ email: req.body.email })
        if (newadmin) {
            return res.status(400).send("user already exist")
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.passward, salt);
        newadmin = await admin.create({
            name: req.body.name,
            email: req.body.email,
            passward: hashedPassword,
            Number: req.body.Number,
        })
        let saveadmin = await newadmin.save();
        // res.json(savedoc);
        // let data = {
        //     admin: {
        //         id: newadmin.id
        //     }
        // }
        // let token = jwt.sign(data, doc_secret_signature)
        // res.json({ token })
        // await admin.save();

        res.json("Admin created successfully");

    } catch (error) {
        console.error(error.message)
        res.status(420).send("internal server error in creation of admin")
    }
})

//add patient data on /api/auth/addpatient
router.post('/addpatient', authenticateUser, checkRole(['admin']), [
    body('name').isLength({ min: 6 }),
    body('Age').isLength({ min: 1 }, { max: 100 }),
    body('email').isEmail(),
    body('Number').isLength({ min: 10 }, { max: 10 }),
    // body('passward').isLength({ min: 4 }).exists(),
    body('sex').exists()
], async (req, res) => {
    const result = validationResult(req)
    if (!result.isEmpty()) {
        return res.status(420).send("wronge cradential")
    }
    try {
        let newpatient = await patient.findOne({ email: req.body.email })
        if (newpatient) {
            return res.status(400).send("patient already exist")
        }
        newpatient = await patient.create({
            name: req.body.name,
            email: req.body.email,
            Number: req.body.Number,
            Age: req.body.Age,
            sex: req.body.sex,
            // passward: req.body.passward,
            passward: null,
            isActivated: false
        })
        const savepati = await newpatient.save()
        // let data = {
        //     patient: {
        //         id: newpatient.id
        //     }
        // }
        // let token = jwt.sign(data, doc_secret_signature)
        // res.json({ token })
        // res.json(savepati);
        res.status(201).json({ message: "patient created. Awaiting account activation." });
    } catch (error) {
        console.error(error.message)
        res.status(400).send("internal server error in creating patients")
    }
})

//doctor accont creation on /api/auth/createdoc
router.post('/createdoc', authenticateUser, checkRole(['admin']), [
    body('name').isLength({ min: 6 }),
    // body('passward').isLength({ min: 4 }).exists(),
    body('email').isEmail(),
    body('Number').isLength({ min: 10 }, { max: 10 })
], async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(420).send("wronge cradential")
    }
    try {
        let newdoc = await doctor.findOne({ email: req.body.email })
        if (newdoc) {
            return res.status(400).send("user already exist")
        }
        newdoc = await doctor.create({
            name: req.body.name,
            email: req.body.email,
            // passward: req.body.passward,
            Number: req.body.Number,
            passward: null,
            isActivated: false
        })
        let savedoc = await newdoc.save();
        // res.json(savedoc);
        // let data = {
        //     doctor: {
        //         id: newdoc.id
        //     }
        // }
        // let token = jwt.sign(data, doc_secret_signature)
        // res.json({ token })
        res.status(201).json({ message: "doctor created. Awaiting account activation." });
    } catch (error) {
        console.error(error.message)
        res.status(420).send("internal server error in creation of doctor")
    }
})

// creating lab assistant throught /api/auth/createlabassis
router.post('/createlabassis', authenticateUser, checkRole(['admin']), [
    body('name').isLength({ min: 4 }),
    // body('passward').isLength({ min: 4 }).exists(),
    body('email').isEmail(),
    body('lab_name').isLength({ min: 3 }),
    body('Number').isLength({ min: 10 }, { max: 10 })
], async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(420).send("wronge cradential")
    }
    try {
        let newassistend = await lab_assistant.findOne({ email: req.body.email })
        if (newassistend) {
            return res.status(400).send("user already exist")
        }
        newassistend = await lab_assistant.create({
            name: req.body.name,
            email: req.body.email,
            // passward: req.body.passward,
            Number: req.body.Number,
            lab_name: req.body.lab_name,
            passward: null,
            isActivated: false
        })
        let saveassis = await newassistend.save();
        // res.json(savedoc);
        // let data = {
        //     lab_assistant: {
        //         id: newassistend.id
        //     }
        // }
        // let token = jwt.sign(data, doc_secret_signature)
        // res.json({ token })
        res.status(201).json({ message: "Lab assistant created. Awaiting account activation." });
    } catch (error) {
        console.error(error.message)
        res.status(420).send("internal server error in creation of Lab assistant")
    }
})

//sign-up for the lab_assistant using /api/auth/role/signup

router.post('/:role/signup', [
    body('email').isEmail(),
    body('passward').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const role = req.params.role.toLowerCase();
    const { email, passward } = req.body;

    // Map roles to their respective models
    const roleModelMap = {
        'lab_assistant': lab_assistant,
        'doctor': doctor,
        'patient': patient
    };

    const Model = roleModelMap[role];

    // Validate role
    if (!Model) {
        return res.status(400).json({ error: 'Invalid role specified in URL' });
    }

    try {
        const user = await Model.findOne({ email });

        if (!user) {
            return res.status(404).send("Account not found");
        }

        if (user.isActivated) {
            return res.status(403).send("Account already activated");
        }

        // Optional: Hash password (recommended)
        // const salt = await bcrypt.genSalt(10);
        // const hashedPassword = await bcrypt.hash(passward, salt);
        // user.passward = hashedPassword;

        // user.passward = passward;
        // user.isActivated = true;
        // await user.save();

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(passward, salt);

        user.passward = hashedPassword;
        user.isActivated = true;
        await user.save();

        res.status(200).json({ message: `Account activated. You can now log in as ${role}.` });
    } catch (error) {
        console.error(error.message);
        res.status(500).send(`Internal server error during signup of ${role}`);
    }
});




//login doctor throught /api/auth/login
router.post('/login', [
    body('passward').exists(),
    body('email').isEmail(),
    body('role').exists()
], async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(420).send("wronge cradential")
    }
    const roleModelMap = {
        patient: patient,
        doctor: doctor,
        admin: admin,
        lab_assistant: Lab_assistant
        // receptionist: Receptionist // add when needed
    };
    try {
        const { captchaToken } = req.body;

        if (!captchaToken) {
            return res.status(400).json({ message: "Captcha required" });
        }

        const captchaResponse = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify`,
            null,
            {
                params: {
                    secret: process.env.RECAPTCHA_SECRET,
                    response: captchaToken
                }
            });

        if (!captchaResponse.data.success) {
            return res.status(400).json({ message: "Captcha verification failed" });
        }
        const role = req.body.role.toLowerCase();
        const model = roleModelMap[role];
        const user = await model.findOne({ email: req.body.email });
        if (!user || !user.isActivated) {
            return res.status(420).send("wrong credential of account is deactivated");
        }
        // if (user.passward !== req.body.passward) {
        //     return res.status(420).send("wornd passward");
        // }
        // res.json(savedoc);
        // console.log(req.body.passward)
        const isMatch = await bcrypt.compare(req.body.passward, user.passward);

        if (!isMatch) {
            return res.status(420).send("wornd passward");
        }

        // const token = jwt.sign(
        //     { id: user._id, role: req.body.role.toLowerCase() },
        //     doc_secret_signature,
        //     // { expiresIn: "1h" }
        // );

        const token = jwt.sign(
            { id: user._id, role: req.body.role.toLowerCase() },
            doc_secret_signature,
            { expiresIn: "24h" }
        );
        // let data = {
        //     doctor: {
        //         id: doc.id
        //     }
        // }
        // let token = jwt.sign(data, doc_secret_signature)
        // console.log("hello")
        res.json(token)
    } catch (error) {
        console.error(error.message)
        return res.status(420).send(`internal server error in ${req.body.role} login`)
    }
})

module.exports = router;