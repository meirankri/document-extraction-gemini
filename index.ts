import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createPool, Pool } from 'mysql2/promise';
import nodemailer from 'nodemailer';
import { RowDataPacket } from 'mysql2';
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { AWSEmailNotificationService } from './repositories/AWSEmailNotificationService';
import { slugify } from './utils/format';

dotenv.config();

export interface Document {
    id: string;
    content: Buffer;
    mimeType: string;
}

export interface MedicalInfo {
    patientFirstName: string;
    patientLastName: string;
    patientGender: string;
    patientBirthdate: string;
    examinationDate: string;
    examinationType: string;
    sendToExternalApi: boolean;
}

export interface ExaminationType extends RowDataPacket {
    id: number;
    name: string;
    code: string;
    coordonance?: string;
}

export interface ProcessDocumentUseCase {
    execute(document: Document): Promise<MedicalInfo>;
}

export interface DocumentExtractor {
    extract(document: Document): Promise<MedicalInfo>;
}

export interface ExaminationTypeRepository {
    findByName(name: string): Promise<ExaminationType | null>;
}

export interface ExternalApiPort {
    sendMedicalInfo(info: MedicalInfo & { documentId: string }): Promise<any>;
}

export interface NotificationPort {
    notifyMissingInformation(
        documentId: string,
        missingFields: string[],
        partialInfo: Partial<MedicalInfo>
    ): Promise<any>;
}

export class DocumentProcessingService implements ProcessDocumentUseCase {
    constructor(
        private readonly documentExtractor: DocumentExtractor,
        private readonly examinationTypeRepository: ExaminationTypeRepository,
        private readonly externalApi: ExternalApiPort,
        private readonly notificationService: NotificationPort
    ) {}

    async execute(document: Document): Promise<MedicalInfo> {
        const medicalInfo = await this.documentExtractor.extract(document);

        const validation = this.validateInformation(medicalInfo);
        if (!validation.isValid) {
            await this.notificationService.notifyMissingInformation(
                document.id,
                validation.missingFields,
                medicalInfo
            );
            throw new Error(`Missing required fields: ${validation.missingFields.join(', ')}`);
        }

        const examinationType = await this.examinationTypeRepository.findByName(
            medicalInfo.examinationType
        );
        if (!examinationType) {
            const notification = await this.notificationService.notifyMissingInformation(
                document.id,
                ['Invalid examination type'],
                medicalInfo
            );
            console.log('Notification sent:', notification);
            return {...medicalInfo, sendToExternalApi: false};
        }

        await this.externalApi.sendMedicalInfo({
            ...medicalInfo,
            documentId: document.id
        });

        return medicalInfo;
    }

    private validateInformation(info: Partial<MedicalInfo>): {
        isValid: boolean;
        missingFields: string[];
    } {
        const requiredFields: (keyof MedicalInfo)[] = [
            'patientFirstName',
            'patientLastName',
            'patientGender',
            'patientBirthdate',
            'examinationDate',
            'examinationType'
        ];

        const missingFields = requiredFields.filter(field => !info[field]);

        return {
            isValid: missingFields.length === 0,
            missingFields
        };
    }
}

export class GeminiDocumentExtractor implements DocumentExtractor {
    private readonly genAI: GoogleGenerativeAI;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async extract(document: Document): Promise<MedicalInfo> {
        const model = this.genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            safetySettings: [
                {
                  category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                  category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                  category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                  category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                }
            ],
            generationConfig: {
                temperature: 1,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 8192,
            }
        });

        const prompt = `Extract the following information from this document and return it as a JSON:
            - patientFirstName
            - patientLastName
            - patientGender
            - patientBirthdate
            - examinationDate
            - examinationType
            
            Return format should be exactly:
            {
              "patientFirstName": "string",
              "patientLastName": "string",
              "patientGender": "string",
              "patientBirthdate": "YYYY-MM-DD",
              "examinationDate": "YYYY-MM-DD",
              "examinationType": "string"
            }`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: document.content.toString('base64'),
                    mimeType: document.mimeType
                }
            }
        ]);

        const response = await result.response;
        const text = response.text();
        
        // Nettoyer la réponse pour extraire uniquement le JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Aucun JSON valide trouvé dans la réponse');
        }
        
        return JSON.parse(jsonMatch[0]);
    }
}

export class MySqlExaminationTypeRepository implements ExaminationTypeRepository {
    constructor(private readonly pool: Pool) {}

    async findByName(name: string): Promise<ExaminationType | null> {
        const formattedSearchName = slugify(name);
        const [rows] = await this.pool.execute<ExaminationType[]>(
            `SELECT mt.* FROM medicalType mt 
            INNER JOIN coordonance c ON c.typeID = mt.id 
            WHERE LOWER(c.name) = LOWER(?) limit 1`,
            [formattedSearchName]
        );
        console.log('rows', rows);
        return rows[0] || null;
    }
}

export class HttpExternalApi implements ExternalApiPort {
    constructor(
        private readonly apiUrl: string,
    ) {}

    async sendMedicalInfo(info: MedicalInfo & { documentId: string }): Promise<any> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(info)
        });

        if (!response.ok) {
            throw new Error(`External API error: ${response.statusText}`);
        }

        return response.json();
    }
}

export class EmailNotificationService implements NotificationPort {
    private readonly transporter: nodemailer.Transporter;

    constructor(
        smtpConfig: {
            host: string;
            port: number;
            secure: boolean;
            auth: {
                user: string;
                pass: string;
            };
        },
        private readonly emailConfig: {
            from: string;
            to: string;
        }
    ) {
        this.transporter = nodemailer.createTransport(smtpConfig);
    }

    async notifyMissingInformation(
        documentId: string,
        missingFields: string[],
        partialInfo: Partial<MedicalInfo>
    ): Promise<void> {
        const htmlContent = `
            <h2>Document Information Incomplete</h2>
            <p>Document ID: ${documentId}</p>
            
            <h3>Missing Fields:</h3>
            <ul>
              ${missingFields.map(field => `<li>${field}</li>`).join('')}
            </ul>
      
            <h3>Extracted Information:</h3>
            <table style="border-collapse: collapse; width: 100%;">
              <tr>
                <th style="border: 1px solid #ddd; padding: 8px;">Field</th>
                <th style="border: 1px solid #ddd; padding: 8px;">Value</th>
              </tr>
              ${Object.entries(partialInfo)
                .map(([key, value]) => `
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${key}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${value || 'N/A'}</td>
                  </tr>
                `).join('')}
            </table>
          `;

        await this.transporter.sendMail({
            from: this.emailConfig.from,
            to: this.emailConfig.to,
            subject: `Missing Information - Document ${documentId}`,
            html: htmlContent
        });
    }
}

export class NotificationServiceAdapter implements NotificationPort {
    constructor(
        private readonly notificationService: NotificationPort,
        private readonly isLoggingOnly: boolean = true
    ) {}

    async notifyMissingInformation(
        documentId: string,
        missingFields: string[],
        partialInfo: Partial<MedicalInfo>
    ): Promise<void> {
        if (this.isLoggingOnly) {
            console.log('=== EMAIL NOTIFICATION ===');
            console.log('Document ID:', documentId);
            console.log('Missing Fields:', missingFields);
            console.log('Partial Info:', partialInfo);
            console.log('========================');
            return;
        }

        await this.notificationService.notifyMissingInformation(documentId, missingFields, partialInfo);
    }
}

export class DocumentController {
    constructor(private readonly processDocumentUseCase: ProcessDocumentUseCase) {}

    async processDocument(req: express.Request, res: express.Response): Promise<void> {
        console.log('Processing document...', req.body);
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
            console.error('Error processing document:', error);
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

    router.post('/process', 
        (req, res, next) => {
            console.log('Requête reçue');
            next();
        },
        upload.single('document'),
        (req, res, next) => {
            console.log('Après upload:', req.file);
            next();
        },
        (req, res) => controller.processDocument(req, res)
    );

    return router;
}

export class Database {
    private static pool: Pool;

    static initialize(config: {
        host: string;
        user: string;
        password: string;
            database: string;
        port: number;
    }): void {
        this.pool = createPool(config);
    }

    static getPool(): Pool {
        if (!this.pool) {
            throw new Error('Database not initialized');
        }
        return this.pool;
    }
}

Database.initialize({
    host: process.env.DB_HOST!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    port: parseInt(process.env.DB_PORT!)
});

const documentExtractor = new GeminiDocumentExtractor(
    process.env.GEMINI_API_KEY!
);

const examinationTypeRepository = new MySqlExaminationTypeRepository(
    Database.getPool()
);

const externalApi = new HttpExternalApi(
    process.env.EXTERNAL_API_URL!,
);

const emailService = new EmailNotificationService(
    {
        host: process.env.SMTP_HOST!,
        port: parseInt(process.env.SMTP_PORT!),
        secure: true,
        auth: {
            user: process.env.SMTP_USER!,
            pass: process.env.SMTP_PASSWORD!
        }
    },
    {
        from: process.env.EMAIL_FROM!,
        to: process.env.EMAIL_TO!
    }
);

const awsEmailService = new AWSEmailNotificationService({
    from: process.env.EMAIL_FROM!,
    to: process.env.EMAIL_TO!,
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
});

// Vous pouvez maintenant choisir entre les deux services
const notificationService = new NotificationServiceAdapter(
    awsEmailService,
    true
);

const documentProcessingService = new DocumentProcessingService(
    documentExtractor,
    examinationTypeRepository,
    externalApi,
    notificationService
);

const documentController = new DocumentController(documentProcessingService);

const app = express();
app.use(express.json());
app.use('/api/documents', createDocumentRouter(documentController));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
