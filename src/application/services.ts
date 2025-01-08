import { Document, MedicalInfo } from "../domain/models";
import {
  ProcessDocumentUseCase,
  DocumentExtractor,
  ExaminationTypeRepository,
  ExternalApiPort,
  NotificationPort,
} from "../domain/ports";

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
      throw new Error(
        `Missing required fields: ${validation.missingFields.join(", ")}`
      );
    }

    const examinationType = await this.examinationTypeRepository.findByName(
      medicalInfo.examinationType
    );

    if (!examinationType) {
      await this.notificationService.notifyMissingInformation(
        document.id,
        ["Invalid examination type"],
        medicalInfo
      );
      return { ...medicalInfo, status: 2, folderName: "" };
    }

    // await this.externalApi.sendMedicalInfo({
    //     ...medicalInfo,
    //     documentId: document.id
    // });

    return { ...medicalInfo, folderName: examinationType.name, status: 1 };
  }

  private validateInformation(info: Partial<MedicalInfo>): {
    isValid: boolean;
    missingFields: string[];
  } {
    const requiredFields: (keyof MedicalInfo)[] = [
      "patientFirstName",
      "patientLastName",
      "patientGender",
      "patientBirthdate",
      "examinationDate",
      "examinationType",
    ];

    const missingFields = requiredFields.filter((field) => !info[field]);

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  }
}
