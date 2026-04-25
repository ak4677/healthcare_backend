/**
 * routes/models.js
 * =================
 * Node.js Express routes that call the skin cancer FastAPI server
 * and write prediction results back into MongoDB patientdata documents.
 *
 * FastAPI server: http://localhost:8001
 *   POST /predict   ← accepts multipart image, returns full prediction + GradCAM
 *
 * Two endpoints exposed to the doctor frontend:
 *   POST /api/models/skinPredict      { patientDataId, imageIndex }
 *   POST /api/models/skinPredictAll   { patientDataId }
 */

const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const FormData   = require('form-data');
const fs         = require('fs');
const path       = require('path');

const patientdata      = require('../modules/patientdata');
const authenticateUser = require('../middleware/authenticateUser');
const checkRole        = require('../middleware/checkRole');

const FASTAPI_URL = process.env.FASTAPI_SKIN || 'http://localhost:8001';

// Folder where GradCAM overlay PNGs are saved to disk
const GRADCAM_DIR = path.join(__dirname, '../uploads/gradcam');
if (!fs.existsSync(GRADCAM_DIR)) {
    fs.mkdirSync(GRADCAM_DIR, { recursive: true });
}


// ─────────────────────────────────────────────────────────────────────────────
// Helper: call FastAPI /predict with one image file, return parsed response
// ─────────────────────────────────────────────────────────────────────────────
async function callSkinPredict(imagePath) {
    const absolutePath = path.resolve(imagePath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Image file not found on disk: ${imagePath}`);
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(absolutePath), path.basename(absolutePath));

    let response;
    try {
        response = await axios.post(
            `${FASTAPI_URL}/predict`,
            formData,
            { headers: formData.getHeaders(), timeout: 60000 }
        );
    } catch (axiosErr) {
        const detail = axiosErr.response?.data || axiosErr.message;
        throw new Error(`Skin cancer ML service error: ${JSON.stringify(detail)}`);
    }

    return response.data;
}


// ─────────────────────────────────────────────────────────────────────────────
// Helper: save the base64 GradCAM PNG to disk and return the URL path
// ─────────────────────────────────────────────────────────────────────────────
function saveGradCAM(base64Str, patientDataId, imageIndex) {
    if (!base64Str) return { gradcam_image_path: null, gradcam_image_url: null };

    const filename = `gradcam_${patientDataId}_img${imageIndex}_${Date.now()}.png`;
    const filePath = path.join(GRADCAM_DIR, filename);

    fs.writeFileSync(filePath, Buffer.from(base64Str, 'base64'));

    return {
        gradcam_image_path: filePath,
        gradcam_image_url:  `/uploads/gradcam/${filename}`.replace(/\\/g, '/'),
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// Helper: build the prediction sub-document from a FastAPI response
// Matches the predictionSchema fields in patientdata.js exactly.
// ─────────────────────────────────────────────────────────────────────────────
function buildPredictionDoc(prediction, imagePath, patientDataId, imageIndex) {
    const { gradcam_image_path, gradcam_image_url } = saveGradCAM(
        prediction.gradcam_image, patientDataId, imageIndex
    );

    return {
        image_path:              imagePath.replace(/\\/g, '/'),
        binary_prediction:       prediction.binary_prediction,       // 'Benign' | 'Malignant'
        binary_confidence:       prediction.binary_confidence,       // float 0-1
        multi_class_prediction:  prediction.multi_class_prediction,  // e.g. 'mel'
        multi_class_description: prediction.multi_class_description, // e.g. 'Melanoma'
        multi_class_confidence:  prediction.multi_class_confidence,  // float 0-1
        all_class_probabilities: prediction.all_class_probabilities, // { akiec: 0.01, ... }
        gradcam_image_path,
        gradcam_image_url,
        predictedAt:             new Date(),
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/models/skinPredict
//
// Runs prediction on ONE image in a patientdata document.
// Body: { patientDataId: string, imageIndex: number (default 0) }
// Role: doctor only
// ─────────────────────────────────────────────────────────────────────────────
router.post(
    '/skinPredict',
    authenticateUser,
    checkRole(['doctor']),
    async (req, res) => {
        try {
            const { patientDataId, imageIndex = 0 } = req.body;

            if (!patientDataId) {
                return res.status(400).json({ error: 'patientDataId is required' });
            }

            // Load the patientdata record
            const record = await patientdata.findById(patientDataId);
            if (!record) {
                return res.status(404).json({ error: 'Patient data record not found' });
            }

            const images = record.skinData?.images;
            if (!images || images.length === 0) {
                return res.status(400).json({ error: 'No skin images found in this record' });
            }

            if (imageIndex < 0 || imageIndex >= images.length) {
                return res.status(400).json({
                    error: `imageIndex ${imageIndex} out of range (record has ${images.length} image(s))`
                });
            }

            const imagePath = images[imageIndex];

            // Call FastAPI
            let fastapiResult;
            try {
                fastapiResult = await callSkinPredict(imagePath);
            } catch (err) {
                return res.status(502).json({ error: 'Prediction service error', detail: err.message });
            }

            // Build prediction sub-document
            const predictionDoc = buildPredictionDoc(fastapiResult, imagePath, patientDataId, imageIndex);

            // Upsert into skinData.predictions[imageIndex]
            const predictions = record.skinData.predictions
                ? record.skinData.predictions.map(p => p?.toObject ? p.toObject() : p)
                : [];

            while (predictions.length <= imageIndex) predictions.push(null);
            predictions[imageIndex] = predictionDoc;

            await patientdata.findByIdAndUpdate(
                patientDataId,
                { $set: { 'skinData.predictions': predictions } },
                { new: true }
            );

            return res.status(200).json({
                message:      'Skin cancer prediction complete',
                patientDataId,
                imageIndex,
                prediction:   predictionDoc,
            });

        } catch (err) {
            console.error('[models.js/skinPredict]', err.message);
            return res.status(500).json({ error: 'Internal server error', detail: err.message });
        }
    }
);


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/models/skinPredictAll
//
// Runs prediction on ALL images in a patientdata document sequentially.
// Body: { patientDataId: string }
// Role: doctor only
// ─────────────────────────────────────────────────────────────────────────────
router.post(
    '/skinPredictAll',
    authenticateUser,
    checkRole(['doctor']),
    async (req, res) => {
        try {
            const { patientDataId } = req.body;

            if (!patientDataId) {
                return res.status(400).json({ error: 'patientDataId is required' });
            }

            const record = await patientdata.findById(patientDataId);
            if (!record) {
                return res.status(404).json({ error: 'Patient data record not found' });
            }

            const images = record.skinData?.images;
            if (!images || images.length === 0) {
                return res.status(400).json({ error: 'No skin images found in this record' });
            }

            const results = [];

            for (let i = 0; i < images.length; i++) {
                const imagePath = images[i];

                try {
                    const fastapiResult = await callSkinPredict(imagePath);
                    const predictionDoc = buildPredictionDoc(fastapiResult, imagePath, patientDataId, i);
                    results.push({ imageIndex: i, ...predictionDoc });
                } catch (err) {
                    console.error(`[models.js/skinPredictAll] image ${i} failed:`, err.message);
                    results.push({ imageIndex: i, error: err.message });
                }
            }

            // Save all results at once — null for any that errored
            const predictionsToSave = results.map(r =>
                r.error ? null : {
                    image_path:              r.image_path,
                    binary_prediction:       r.binary_prediction,
                    binary_confidence:       r.binary_confidence,
                    multi_class_prediction:  r.multi_class_prediction,
                    multi_class_description: r.multi_class_description,
                    multi_class_confidence:  r.multi_class_confidence,
                    all_class_probabilities: r.all_class_probabilities,
                    gradcam_image_path:      r.gradcam_image_path,
                    gradcam_image_url:       r.gradcam_image_url,
                    predictedAt:             r.predictedAt,
                }
            );

            await patientdata.findByIdAndUpdate(
                patientDataId,
                { $set: { 'skinData.predictions': predictionsToSave } },
                { new: true }
            );

            const succeeded = results.filter(r => !r.error).length;
            const failed    = results.filter(r =>  r.error).length;

            return res.status(200).json({
                message:     `Predictions complete: ${succeeded} succeeded, ${failed} failed`,
                patientDataId,
                total:       images.length,
                succeeded,
                failed,
                predictions: results,
            });

        } catch (err) {
            console.error('[models.js/skinPredictAll]', err.message);
            return res.status(500).json({ error: 'Internal server error', detail: err.message });
        }
    }
);


module.exports = router;