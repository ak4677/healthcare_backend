const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Skin cancer prediction sub-document ─────────────────────────────────────
// One entry per image — filled by models.js after /predict is called.
// Empty array at upload time — never pre-filled with dummy values.
const predictionSchema = new Schema({
    image_path:              { type: String },
    binary_prediction:       { type: String, enum: ['Benign', 'Malignant'] },
    binary_confidence:       { type: Number, min: 0, max: 1 },
    multi_class_prediction:  { type: String },
    multi_class_description: { type: String },
    multi_class_confidence:  { type: Number, min: 0, max: 1 },
    all_class_probabilities: { type: Schema.Types.Mixed },
    gradcam_image_path:      { type: String },
    gradcam_image_url:       { type: String },
    predictedAt:             { type: Date, default: Date.now }
}, { _id: false });


const patientDataSchema = new Schema({

    lab_assistant: {
        type:     Schema.Types.ObjectId,
        ref:      'lab_assistant',
        required: true
    },
    patient: {
        type:     Schema.Types.ObjectId,
        ref:      'patient',
        required: true
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKIN CANCER
    // images saved at upload; predictions filled by models.js /skinPredict
    // ─────────────────────────────────────────────────────────────────────────
    skinData: {
        images:      [{ type: String }],
        predictions: [predictionSchema]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // LIVER CIRRHOSIS
    // Input fields uploaded by lab assistant.
    // Prediction fields written by /predict/liver route after calling FastAPI.
    // Model: TabNet + XGB/LGBM/CatBoost ensemble (liver_outputs/)
    // ─────────────────────────────────────────────────────────────────────────
    liverData: {
        // ── Input fields ───────────────────────────────────────────────────
        ascites:       String,   // 'Y' | 'N'
        hepatome:      String,   // 'Y' | 'N'  (Hepatomegaly)
        spiders:       String,   // 'Y' | 'N'  (Spider angiomata)
        edema:         String,   // 'N' | 'S' | 'Y'
        ALT:           String,   // Alanine aminotransferase (U/L)
        bilirubin:     String,   // Serum bilirubin (mg/dL)
        cholesterol:   String,   // Serum cholesterol (mg/dL)
        albumin:       String,   // Serum albumin (g/dL)
        copper:        String,   // Urine copper (µg/day)
        alk_phos:      String,   // Alkaline phosphatase (U/L)
        SGOT:          String,   // AST / SGOT (U/L)
        tryglicerides: String,   // Triglycerides (mg/dL)
        platelets:     String,   // Platelet count (×10³/µL)
        prothrombin:   String,   // Prothrombin time (sec)

        // ── Prediction results (written by backend after FastAPI call) ─────
        prediction:       Number,                        // 0 = low risk | 1 = high risk
        decision:         String,                        // 'POSITIVE' | 'NEGATIVE'
        risk_label:       String,                        // 'Low' | 'Moderate' | 'High'
        risk_probability: Number,                        // calibrated probability 0–1
        risk_percentage:  Number,                        // risk_probability × 100
        threshold_used:   Number,                        // Youden-J optimal threshold
        top_features:     { type: Schema.Types.Mixed },  // top-10 SHAP feature dict
        clinical_flags:   [String],                      // critical value alerts
        shap_bar_chart:   String,                        // base64 PNG
        shap_waterfall:   String,                        // base64 PNG
        gauge_chart:      String,                        // base64 PNG
        model_used:       String,                        // 'TabNet' | 'Ensemble'
        predictedAt:      Date,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CARDIOVASCULAR DISEASE (CVD)
    // Full UCI Heart Disease feature set.
    // Input fields uploaded by lab assistant.
    // Prediction fields written by /predict/cvd route after calling FastAPI.
    // ─────────────────────────────────────────────────────────────────────────
    cvdData: {
        // ── Input fields ───────────────────────────────────────────────────
        age:           String,   // Age in years
        sex:           String,   // '0' = Female | '1' = Male
        cp:            String,   // Chest pain type 0–3
        bloodPressure: String,   // Resting BP (mmHg)
        cholesterol:   String,   // Serum cholesterol (mg/dL)
        bloodSugar:    String,   // Fasting blood sugar >120 mg/dL  0|1
        restecg:       String,   // Resting ECG result  0|1|2
        heartRate:     String,   // Max heart rate achieved (thalach)
        exang:         String,   // Exercise-induced angina  0|1
        oldpeak:       String,   // ST depression (oldpeak)
        slope:         String,   // ST slope  0|1|2
        ca:            String,   // Major vessels coloured by fluoroscopy  0–4

        // ── Prediction results (written by backend after FastAPI call) ─────
        prediction:        Number,                        // 0 | 1
        risk_label:        String,                        // 'Low' | 'Moderate' | 'High'
        risk_probability:  Number,                        // 0–1
        risk_percentage:   Number,                        // 0–100
        top3_risk_factors: { type: Schema.Types.Mixed },  // top-3 SHAP dict
        gauge_chart:       String,                        // base64 PNG
        shap_bar_chart:    String,                        // base64 PNG
        predictedAt:       Date,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // BASIC HEALTH ASSESSMENT
    // Mixture-of-Experts: CBC + Kidney + Liver(ILPD) + Thyroid + Urinalysis
    //                     + ECG 1D-CNN + Chest X-ray EfficientNet-B0
    //                     + Gating Network → health score 0–100
    // Input fields uploaded by lab assistant.
    // Prediction fields written by /predict/basic route after calling FastAPI.
    // ─────────────────────────────────────────────────────────────────────────
    basicHealthData: {
        // ── CBC input fields ───────────────────────────────────────────────
        WBC:   String,   // White blood cell count (×10³/µL)
        HGB:   String,   // Hemoglobin (g/dL)
        HCT:   String,   // Hematocrit (%)
        PLT:   String,   // Platelet count (×10³/µL)
        RBC:   String,   // Red blood cell count
        MCV:   String,   // Mean corpuscular volume
        MCH:   String,
        MCHC:  String,
        RDW:   String,
        MPV:   String,

        // ── Kidney input fields ────────────────────────────────────────────
        bp:    String,   // Blood pressure
        sc:    String,   // Serum creatinine
        hemo:  String,   // Hemoglobin (kidney panel)
        bu:    String,   // Blood urea
        bgr:   String,   // Blood glucose random
        sod:   String,   // Sodium

        // ── Liver basic panel (ILPD — separate from cirrhosis model) ──────
        total_bilirubin:  String,
        albumin_basic:    String,   // aliased to avoid clash with liverData.albumin
        alk_phosphotase:  String,
        total_proteins:   String,

        // ── Urinalysis input fields ────────────────────────────────────────
        ph:               String,
        specific_gravity: String,
        glucose_urine:    String,   // aliased to avoid clash with cvdData.bloodSugar
        protein_urine:    String,
        blood_urine:      String,
        leukocytes:       String,
        nitrite:          String,
        urobilinogen:     String,

        // ── ECG signal (optional — 187 MIT-BIH samples) ───────────────────
        ecg_signal: [Number],

        // ── Prediction results (written by backend after FastAPI call) ─────
        health_score:    Number,                        // 0–100 gated wellness score
        risk_tier:       String,                        // 'Low' | 'Moderate' | 'High'
        gate_weights:    [Number],                      // per-expert softmax gate weights
        expert_results:  { type: Schema.Types.Mixed },  // { cbc:{...}, kidney:{...}, ... }
        ecg_result:      { type: Schema.Types.Mixed },  // { prediction, proba, class_idx }
        xray_result:     { type: Schema.Types.Mixed },  // { prediction, proba, class_idx }
        clinical_flags:  [String],                      // WBC/HGB out-of-range alerts
        gauge_chart:     String,                        // base64 PNG — health score gauge
        breakdown_chart: String,                        // base64 PNG — expert breakdown bar
        radar_chart:     String,                        // base64 PNG — per-expert radar
        predictedAt:     Date,
    },

}, { timestamps: true });

module.exports = mongoose.model('patientdata', patientDataSchema);