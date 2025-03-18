import { RowDataPacket } from "mysql2";

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
  folderName: string;
  status: number;
  missingInformation?: string[];
}

export interface ExaminationType extends RowDataPacket {
  id: number;
  name: string;
  code: string;
  coordonance?: string;
}

export interface DocumentCategory extends RowDataPacket {
  id: number;
  name: string;
  prompt: string;
}
