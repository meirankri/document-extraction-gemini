import express from "express";
import dotenv from "dotenv";
import { Database, loadConfig } from "./infrastructure/config";
import { GeminiDocumentExtractor } from "./infrastructure/adapters/gemini-extrernal-api";
import { MySqlExaminationTypeRepository } from "./infrastructure/adapters/database";
import { NotificationServiceAdapter } from "./infrastructure/adapters/notification";
import { DocumentProcessingService } from "./application/services";
import { DocumentController } from "./infrastructure/web";
import { createDocumentRouter } from "./infrastructure/web";
import multer from "multer";
import path from "path";
import { DocumentConverter } from "./infrastructure/services/documentConverter";
import fs from "fs/promises";
import { SMTPNotificationAdapter } from "./infrastructure/adapters/SMTPNotificationAdapter";

dotenv.config();
const config = loadConfig();

Database.initialize({
  host: process.env.DB_HOST!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  port: parseInt(process.env.DB_PORT!),
});

const documentExtractor = new GeminiDocumentExtractor(
  process.env.GEMINI_API_KEY!
);
const examinationTypeRepository = new MySqlExaminationTypeRepository(
  Database.getPool()
);

const notificationAdapter = new SMTPNotificationAdapter({
  from: config.email.config.from,
  to: config.email.config.to,
  host: config.email.smtp.host,
  port: config.email.smtp.port,
  secure: config.email.smtp.secure,
  auth: {
    user: config.email.smtp.auth.user,
    pass: config.email.smtp.auth.pass,
  },
});

const notificationService = new NotificationServiceAdapter(
  notificationAdapter,
  process.env.NODE_ENV !== "production"
);

const documentProcessingService = new DocumentProcessingService(
  documentExtractor,
  examinationTypeRepository,
  notificationService
);

const documentController = new DocumentController(documentProcessingService);

const app = express();
app.use(express.json());
app.use("/", createDocumentRouter(documentController));

const upload = multer({ dest: "uploads/" });

app.post(
  "/convert",
  upload.single("document"),
  async (req: express.Request, res: express.Response): Promise<void> => {
    const filesToClean: string[] = [];

    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const inputPath = req.file.path;
      const outputPath = path.join("uploads", `${req.file.filename}.pdf`);

      filesToClean.push(inputPath);
      filesToClean.push(outputPath);

      const result = await DocumentConverter.convertToPdf(
        inputPath,
        outputPath
      );

      if (result.success) {
        res.download(
          outputPath,
          `${path.basename(
            req.file.originalname,
            path.extname(req.file.originalname)
          )}.pdf`,
          async (err) => {
            if (err) {
              console.error("Error sending file:", err);
            }
            await cleanupFiles(filesToClean);
          }
        );
        return;
      }

      res.status(500).json({ error: result.message });
      await cleanupFiles(filesToClean);
      return;
    } catch (error) {
      await cleanupFiles(filesToClean);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }
  }
);

async function cleanupFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      await fs.unlink(file);
      console.log(`Cleaned up file: ${file}`);
    } catch (error) {
      console.error(`Error cleaning up file ${file}:`, error);
    }
  }
}

app.get("/health", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
