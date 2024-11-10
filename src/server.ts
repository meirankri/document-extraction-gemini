import express from 'express';
import dotenv from 'dotenv';
import { Database, loadConfig } from './infrastructure/config';
import { GeminiDocumentExtractor } from './infrastructure/adapters/gemini-extrernal-api';
import { MySqlExaminationTypeRepository } from './infrastructure/adapters/database';
import { HttpExternalApi } from './infrastructure/adapters/gemini-extrernal-api';
import { EmailNotificationService, NotificationServiceAdapter } from './infrastructure/adapters/notification';
import { DocumentProcessingService } from './application/services';
import { DocumentController } from './infrastructure/web';
import { createDocumentRouter } from './infrastructure/web';
import { SESNotificationAdapter } from './infrastructure/adapters/SESNotificationAdapter';


dotenv.config();
const config = loadConfig();

Database.initialize({
    host: process.env.DB_HOST!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    port: parseInt(process.env.DB_PORT!)
});

const documentExtractor = new GeminiDocumentExtractor(process.env.GEMINI_API_KEY!);
const examinationTypeRepository = new MySqlExaminationTypeRepository(Database.getPool());
const externalApi = new HttpExternalApi(process.env.EXTERNAL_API_URL!);

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

const sesNotificationService = new SESNotificationAdapter({
    from: config.email.config.from,
    to: config.email.config.to,
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey
    }
});

const notificationService = new NotificationServiceAdapter(
    sesNotificationService,
    process.env.NODE_ENV !== 'production'
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
app.use('/', createDocumentRouter(documentController));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});