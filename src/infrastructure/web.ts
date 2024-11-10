import express from 'express';
import multer from 'multer';
import { Document } from '../domain/models';
import { ProcessDocumentUseCase } from '../domain/ports';
import { logger } from '../utils/logger';

export class DocumentController {
    constructor(private readonly processDocumentUseCase: ProcessDocumentUseCase) {}

    async processDocument(req: express.Request, res: express.Response): Promise<void> {
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

            const document: Document = {
                id: documentId,
                content: req.file.buffer,
                mimeType: req.file.mimetype
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
        }
    }
}

export function createDocumentRouter(controller: DocumentController): express.Router {
    const router = express.Router();
    const upload = multer({
        storage: multer.memoryStorage(),
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