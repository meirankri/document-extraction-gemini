import { RowDataPacket } from 'mysql2';

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
    status: number;
}

export interface ExaminationType extends RowDataPacket {
    id: number;
    name: string;
    code: string;
    coordonance?: string;
}