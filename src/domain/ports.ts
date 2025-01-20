import { Attachment } from "nodemailer/lib/mailer";
import { Document, MedicalInfo, ExaminationType } from "./models";

export interface ProcessDocumentUseCase {
  execute(document: Document): Promise<MedicalInfo>;
}

export interface DocumentExtractor {
  extract(
    document: Document
  ): Promise<Omit<MedicalInfo, "status" | "folderName">>;
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
    partialInfo: Partial<MedicalInfo>,
    attachment?: Attachment
  ): Promise<any>;
}
