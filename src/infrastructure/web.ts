import express from 'express';
import multer from 'multer';
import { Document } from '../domain/models';
import { ProcessDocumentUseCase } from '../domain/ports';
import { logger } from '../utils/logger';
import { DocumentConverter } from './services/documentConverter';
import path from 'path';
import fs from 'fs/promises';

export class DocumentController {
    constructor(private readonly processDocumentUseCase: ProcessDocumentUseCase) {}

    async processDocument(req: express.Request, res: express.Response): Promise<void> {
        const filesToClean: string[] = [];
        
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file uploaded' });
                return;
            }

            const documentId = req.body.documentId;
            if (!documentId) {
                res.status(400).json({ error: 'Document ID is required' });
                return;
            }

            let fileBuffer: Buffer;
            let fileMimeType = req.file.mimetype;

            // Si le fichier n'est pas déjà un PDF, on le convertit
            if (fileMimeType !== 'application/pdf') {
                const inputPath = req.file.path;
                const outputPath = path.join('uploads', `${req.file.filename}.pdf`);
                
                filesToClean.push(inputPath);
                filesToClean.push(outputPath);

                const conversionResult = await DocumentConverter.convertToPdf(inputPath, outputPath);
                
                if (!conversionResult.success) {
                    throw new Error(`PDF conversion failed: ${conversionResult.message}`);
                }

                fileBuffer = await fs.readFile(outputPath);
                fileMimeType = 'application/pdf';
            } else {
                fileBuffer = req.file.buffer;
            }

            const document: Document = {
                id: documentId,
                content: fileBuffer,
                mimeType: fileMimeType
            };

            const result = await this.processDocumentUseCase.execute(document);
            res.json({ success: true, data: result });
            
        } catch (error) {
            logger({
                message: 'Error processing document',
                context: error
            }).error();
            res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        } finally {
            // Nettoyage des fichiers temporaires
            await this.cleanupFiles(filesToClean);
        }
    }

    private async cleanupFiles(files: string[]): Promise<void> {
        for (const file of files) {
            try {
                await fs.unlink(file);
                console.log(`Cleaned up file: ${file}`);
            } catch (error) {
                console.error(`Error cleaning up file ${file}:`, error);
            }
        }
    }
}

export function createDocumentRouter(controller: DocumentController): express.Router {
    const router = express.Router();
    const upload = multer({
        storage: multer.diskStorage({
            destination: 'uploads/',
            filename: (_, file, cb) => {
                cb(null, `${Date.now()}-${file.originalname}`);
            }
        }),
        fileFilter: (_, file, cb) => {
            const allowedMimes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg',
                'image/png'
            ];
            
            if (allowedMimes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid file type'));
            }
        }
    });

    router.post('/upload', 
        upload.single('document'),
        (req, res) => controller.processDocument(req, res)
    );

    return router;
} 