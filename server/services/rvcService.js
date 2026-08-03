import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '../models/rvc');
const SCRIPTS_DIR = path.join(__dirname, '../scripts');

if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

/**
 * Execute RVC Voice Conversion for a given audio file and historical figure ID
 */
export async function convertVoiceWithRVC({ inputAudioPath, figureId, pitch = 0 }) {
  return new Promise((resolve) => {
    const modelPath = path.join(MODELS_DIR, `${figureId}.pth`);
    const indexPath = path.join(MODELS_DIR, `${figureId}.index`);
    const outputAudioPath = inputAudioPath.replace(/(\.wav|\.mp3)$/i, '_rvc.wav');

    const scriptPath = path.join(SCRIPTS_DIR, 'rvc_inference.py');

    console.log(`[RVC Service] Converting voice for figure '${figureId}'...`);
    console.log(` - Model: ${modelPath}`);
    console.log(` - Output: ${outputAudioPath}`);

    const command = `python "${scriptPath}" --input "${inputAudioPath}" --model "${modelPath}" --index "${indexPath}" --output "${outputAudioPath}" --pitch ${pitch}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.warn(`[RVC Service Warning]: ${stderr || error.message}`);
        console.log(`[RVC Service] Fallback: Returning original audio url.`);
        return resolve({
          success: true,
          convertedAudioPath: inputAudioPath,
          usedRVCModel: false,
          message: 'RVC model fallback applied (model file pending local training).'
        });
      }

      console.log(`[RVC Service Success]: Voice converted using RVC.`);
      resolve({
        success: true,
        convertedAudioPath: fs.existsSync(outputAudioPath) ? outputAudioPath : inputAudioPath,
        usedRVCModel: fs.existsSync(modelPath),
        message: 'RVC voice conversion complete.'
      });
    });
  });
}

/**
 * Trigger automated dataset prep (Download, Vocal Isolation, 10~15s Slicing)
 */
export async function prepRVCDataset({ inputSource, figureId }) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, 'rvc_dataset_prep.py');
    const command = `python "${scriptPath}" --input "${inputSource}" --figure_id "${figureId}"`;

    console.log(`[RVC Service] Starting dataset preparation for '${figureId}'...`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[RVC Dataset Prep Error]:`, stderr || error.message);
        return reject(error);
      }

      console.log(stdout);
      resolve({
        success: true,
        figureId,
        message: `Dataset prepared and sliced into dataset/${figureId}/slices.`
      });
    });
  });
}
